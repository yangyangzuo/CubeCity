<script setup>
import { checkPlayTime, exitGame, getCurrentPlayConfig, getGameData, saveGameData, userLogin } from "@/api/api.js";
import { setBuildingInteractionsFromConfig } from "@/constants/building-interactions.js";
import { defaultGameState } from "@/api/default-game-state.js";
import { useGameState } from "@/stores/useGameState.js";
import { onMounted, onUnmounted, ref } from "vue";
import BuildingDetails from "./components/BuildingDetails.vue";
import BuildingSidebar from "./components/BuildingSidebar.vue";
import DashboardFooter from "./components/DashboardFooter.vue";
import GameCanvas from "./components/GameCanvas.vue";
import DialogLayer from "./components/layers/DialogLayer.vue";
import AppLayout from "./components/layout/AppLayout.vue";
import MapOverview from "./components/MapOverview.vue";
import ModeIndicator from "./components/ModeIndicator.vue";
import SelectedIndicator from "./components/SelectedIndicator.vue";
import ToastContainer from "./components/ToastContainer.vue";
import TopBar from "./components/TopBar.vue";

const gameState = useGameState();
const canEnterGame = ref(false);
const initErrorMessage = ref("");
const isInitializingGame = ref(true);
const isGameForcedExit = ref(false);
const gameExitMessage = ref("");

// 时间管理 - 统一5秒计时器
let dayInterval = null;
let isPaused = false;
let playCheckInterval = null;
let isExitingGame = false;

// 初始化鉴权：优先使用 URL 上的 token，缺失时自动登录获取
async function initAuthFromUrlOrLogin() {
	const url = new URL(window.location.href);
	const accessToken = url.searchParams.get("authorization");
	const refreshToken = url.searchParams.get("refreshToken");
	const tenantId = url.searchParams.get("tenant-id");

	// 页面首次打开时，将 URL 中的 tenant-id 持久化，供 http 层统一读取
	if (tenantId) {
		localStorage.setItem("tenant_id", tenantId);
	}

	// URL 上有双 token 时直接使用
	if (accessToken && refreshToken) {
		localStorage.setItem(
			"user_info",
			JSON.stringify({
				token: accessToken,
				accessToken,
				refreshToken,
			}),
		);
		return;
	}

	// 仅在 #debug 模式下允许自动登录回退，保持与现有 Debug 开关一致
	const isDebugMode = window.location.hash === "#debug";
	if (!isDebugMode) {
		return;
	}
	// /play?authorization=xxxxxxxx&refreshToken=xxx&tenant-id=1
	// /play?authorization=56c314b16d2443aa98bdbdb899dbf8d3&refreshToken=d36b5e6ede444888a11db16ecf866964&tenant-id=1
	// URL token 不完整时，回退到登录接口
	try {
		const loginRes = await userLogin({
			username: "202601025",
			password: 123456,
			loginType: 3,
		});
		const tokenData = loginRes?.data || {};
		localStorage.setItem(
			"user_info",
			JSON.stringify({
				token: tokenData.accessToken || "",
				accessToken: tokenData.accessToken || "",
				refreshToken: tokenData.refreshToken || "",
			}),
		);
	} catch (error) {
		console.error("自动登录失败:", error);
	}
}

// 页面可见性监听 - 实现HX-43离屏暂停功能
function handleVisibilityChange() {
	if (document.hidden && !isPaused) {
		// 页面不可见时暂停计时器
		if (dayInterval) {
			clearInterval(dayInterval);
			isPaused = true;
		}
	} else if (!document.hidden && isPaused) {
		// 页面可见时恢复计时器
		startDayTimer();
		isPaused = false;
	}
}

// 启动每日计时器
function startDayTimer() {
	if (dayInterval) {
		clearInterval(dayInterval);
	}
	dayInterval = setInterval(() => {
		gameState.nextDay();
	}, 5000);
}

function stopAllGameTimersAndListeners() {
	if (dayInterval) {
		clearInterval(dayInterval);
		dayInterval = null;
	}
	if (playCheckInterval) {
		clearInterval(playCheckInterval);
		playCheckInterval = null;
	}
	document.removeEventListener("visibilitychange", handleVisibilityChange);
	window.removeEventListener("keydown", handleKeydown);
}

// 被强制退出后：保存一次存档 + 退出游戏 + 冻结游戏
async function forceExitGameAndFreeze() {
	if (isExitingGame) {
		return;
	}
	isExitingGame = true;
	try {
		// 1. 先保存一次最新游戏数据
		await saveGameData({
			gameData: JSON.stringify(gameState.$state),
		});
		// 2. 再调用退出游戏接口，更新游玩时长
		await exitGame();
	} catch (error) {
		console.error("退出前保存或退出接口调用失败:", error);
	} finally {
		// 3. 冻结游戏：清理计时器与监听，卸载游戏界面
		stopAllGameTimersAndListeners();
		isPaused = true;
		canEnterGame.value = false;
		isGameForcedExit.value = true;
		gameExitMessage.value = "当前时间段不允许继续游玩，游戏已自动退出。";
		// 4. 弹框提示
		// window.alert(gameExitMessage.value);
		isExitingGame = false;
	}
}

// 每分钟巡检一次：若不允许游玩则自动执行退出流程
async function checkPlayPermission() {
	try {
		const res = await checkPlayTime();
		if (res?.data === false) {
			await forceExitGameAndFreeze();
		}
	} catch (error) {
		console.error("校验游玩权限失败:", error);
	}
}

function startPlayCheckTimer() {
	if (playCheckInterval) {
		clearInterval(playCheckInterval);
	}
	playCheckInterval = setInterval(() => {
		checkPlayPermission();
	}, 60 * 1000);
}

// 初始化游戏存档：强制以后端 gameData 为准
async function initGameStateFromServer() {
	try {
		const gameDataRes = await getGameData();
		const serverData = gameDataRes?.data;

		// 规则1：data 不存在 => 视为用户无历史存档，使用默认存档
		if (!serverData) {
			gameState.$patch(defaultGameState);
			canEnterGame.value = true;
			return;
		}

		// 规则2：data 存在但 gameData 不存在 => 报错并阻止游戏
		const gameDataPayload = serverData.gameData;
		if (!gameDataPayload) {
			throw new Error("接口返回 data 存在，但 gameData 缺失");
		}

		// 规则3：存在 gameData => 按后端存档恢复
		const parsedGameData =
			typeof gameDataPayload === "string"
				? JSON.parse(gameDataPayload)
				: gameDataPayload;
		if (!parsedGameData || typeof parsedGameData !== "object" || !Array.isArray(parsedGameData.metadata)) {
			throw new Error("gameData 数据结构无效");
		}
		// 使用接口返回的存档覆盖本地状态，不再弹窗确认是否继续
		gameState.$patch(parsedGameData);
		canEnterGame.value = true;
	} catch (error) {
		console.error("初始化游戏存档失败:", error);
		initErrorMessage.value = "存档数据异常，无法进行游戏，请联系管理员。";
		canEnterGame.value = false;
	}
}

// 初始化建筑规则：优先使用运营配置接口 valueJson，缺失时回退本地默认规则
async function initBuildingInteractionsConfig() {
	try {
		const configRes = await getCurrentPlayConfig({ configKey: "eduGameConfig" });
		const valueJson = configRes?.data?.valueJson;
		setBuildingInteractionsFromConfig(valueJson);
	} catch (error) {
		// 接口失败时使用默认规则，不阻断游戏进入
		console.warn("获取运营配置失败，使用默认建筑规则:", error);
		setBuildingInteractionsFromConfig(null);
	}
}

// ESC关闭地图总览
function handleKeydown(e) {
	if (gameState.showMapOverview && (e.key === "Escape" || e.key === "Esc")) {
		gameState.setShowMapOverview(false);
	}
}

onMounted(async () => {
	await initAuthFromUrlOrLogin();
	await initBuildingInteractionsConfig();
	await initGameStateFromServer();
	if (!canEnterGame.value) {
		isInitializingGame.value = false;
		return;
	}
	// 初始化成功后先做一次权限校验，不通过则直接退出并冻结
	await checkPlayPermission();
	if (!canEnterGame.value) {
		isInitializingGame.value = false;
		return;
	}
	window.addEventListener("keydown", handleKeydown);
	// 启动统一的5秒计时器（集成每日收益和稳定度更新）
	startDayTimer();
	// 监听页面可见性变化 - 实现HX-43离屏暂停功能
	document.addEventListener("visibilitychange", handleVisibilityChange);
	// 每分钟校验一次是否允许游玩
	startPlayCheckTimer();
	isInitializingGame.value = false;
});

onUnmounted(() => {
	stopAllGameTimersAndListeners();
});
</script>

<template>
	<div
		v-if="isInitializingGame"
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-white"
	>
		<div class="rounded-lg border border-blue-400/40 bg-blue-950/40 px-6 py-5 text-center">
			<p class="text-base font-semibold">游戏初始化中</p>
			<p class="mt-2 text-sm text-blue-200">正在加载存档，请稍候...</p>
		</div>
	</div>
	<div
		v-else-if="isGameForcedExit"
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-white"
	>
		<div class="rounded-lg border border-yellow-400/40 bg-yellow-950/40 px-6 py-5 text-center">
			<p class="text-base font-semibold">游戏已退出</p>
			<p class="mt-2 text-sm text-yellow-100">{{ gameExitMessage }}</p>
		</div>
	</div>
	<div
		v-else-if="!canEnterGame"
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 text-white"
	>
		<div class="rounded-lg border border-red-400/40 bg-red-950/40 px-6 py-5 text-center">
			<p class="text-base font-semibold">游戏初始化失败</p>
			<p class="mt-2 text-sm text-red-200">{{ initErrorMessage }}</p>
		</div>
	</div>
	<AppLayout v-else>
		<template #header>
			<TopBar />
		</template>

		<template #left>
			<BuildingSidebar />
		</template>

		<template #main>
			<ModeIndicator />
			<GameCanvas />
			<SelectedIndicator />
		</template>

		<template #right>
			<BuildingDetails />
		</template>

		<template #footer>
			<DashboardFooter />
		</template>

		<template #overlays>
			<!-- 地图总览浮层：可交互 -->
			<div class="pointer-events-auto">
				<transition name="fade">
					<div
						v-if="gameState.showMapOverview"
						class="absolute top-[20%] right-[50%] translate-x-[50%] w-[min(90vw,600px)] h-[min(90vh,600px)] z-50 bg-[#212121] rounded-lg shadow-lg p-2"
						@contextmenu.prevent="gameState.setShowMapOverview(false)"
					>
						<button
							class="absolute top-2 right-2 w-8 h-8 flex items-center justify-center rounded-full text-xl font-bold text-gray-300 hover:bg-gray-700 hover:text-white transition-colors duration-150 focus:outline-none z-10"
							aria-label="关闭地图总览"
							tabindex="0"
							@click="gameState.setShowMapOverview(false)"
						>
							❌
						</button>
						<MapOverview />
					</div>
				</transition>
			</div>

			<!-- 全局提示与对话层：可交互 -->
			<div class="pointer-events-auto">
				<ToastContainer />
			</div>
			<DialogLayer />
		</template>
	</AppLayout>
</template>

<style>
.fade-enter-active,
.fade-leave-active {
	transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}
</style>
