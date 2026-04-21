<script setup>
import { computed, ref } from "vue";
import LayoutVisibilityConfig from "./LayoutVisibilityConfig.vue";

// 布局组件：通过命名插槽承载页面区域
// - header / footer 高度固定（随断点调整）
// - 中间区域 flex-1 + min-h-0，内部 12 栅格
// - overlays 为全局覆盖层，默认不拦截事件

// 各区域显隐状态
const showHeader = ref(false);
const showLeft = ref(false);
const showRight = ref(false);
const showFooter = ref(false);

// 根据左右侧栏显示状态动态计算主区域在 md 断点下占用的栅格列数
const mainColClass = computed(() => {
	if (showLeft.value && showRight.value) return "md:col-span-8";
	if (showLeft.value || showRight.value) return "md:col-span-10";
	return "md:col-span-12";
});
</script>

<template>
	<!-- 根容器：使用 dvh 适配移动端地址栏变化，桌面回退为 screen -->
	<div class="game-container flex flex-col h-[100dvh] md:h-screen overflow-hidden">
		<!-- 固定头部：高度随断点调整 -->
		<header v-if="showHeader" class="flex-none">
			<slot name="header" />
		</header>

		<!-- 主体：填满剩余高度，内部使用 12 栅格 -->
		<div class="flex-1 min-h-0">
			<div class="grid grid-cols-1 md:grid-cols-12 h-full min-h-0">
				<aside v-if="showLeft" class="md:col-span-2 order-1 md:order-1 min-h-0 overflow-y-auto">
					<slot name="left" />
				</aside>
				<section :class="mainColClass" class="order-3 md:order-2 min-h-0 relative">
					<div class="absolute z-10 top-4 left-1/2 -translate-x-1/2 p-2">
						<LayoutVisibilityConfig
							:show-header="showHeader"
							:show-left="showLeft"
							:show-right="showRight"
							:show-footer="showFooter"
							@update:show-header="showHeader = $event"
							@update:show-left="showLeft = $event"
							@update:show-right="showRight = $event"
							@update:show-footer="showFooter = $event"
						/>
					</div>
					<div class="relative industrial-panel shadow-industrial overflow-hidden h-full">
						<slot name="main" />
					</div>
				</section>
				<aside v-if="showRight" class="md:col-span-2 order-2 md:order-3 min-h-0 overflow-y-auto">
					<slot name="right" />
				</aside>
			</div>
		</div>

		<!-- 固定底部：高度随断点调整 -->
		<footer v-if="showFooter" class="flex-none">
			<slot name="footer" />
		</footer>

		<!-- 全局覆盖层（不拦截事件，子层自行开启 pointer-events） -->
		<div class="fixed inset-0 z-40 pointer-events-none">
			<slot name="overlays" />
		</div>
	</div>
</template>

<style scoped>
/* 无额外样式：完全依赖现有全局样式与 Tailwind 工具类 */
</style>
