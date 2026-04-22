<script setup>
import { ref } from 'vue'

// 布局组件：通过命名插槽承载页面区域
// - 四边面板可收起：点击内缘三角收起为贴边条；点击贴边条恢复面板
// - 收起后贴边条不占原面板空间，中间主区域随 flex 扩展（与参考图一致）
// - 收起三角绝对定位叠在对应区块上，不用 padding 撑开，不改变各区块原有占位尺寸
// - 隐藏按钮：外缘与对应区块边对齐；三角在按钮内水平、垂直居中
// - 顶/底收起按钮同尺寸（collapse-tb）；左/右同尺寸且宽高与顶/底互换（collapse-lr：宽=顶之高、高=顶之宽）
// - 收起/展开用 button 整元素 opacity：默认半透明，悬停、聚焦、按下时不透明（见 .app-layout-opacity-btn）

const props = defineProps({
	/** 顶部收起后贴边条居中显示文案 */
	headerEdgeLabel: { type: String, default: '资产统计' },
	/** 底部收起后贴边条文案 */
	footerEdgeLabel: { type: String, default: '产出及成就' },
	/** 左侧收起后贴边条文案（竖排） */
	leftEdgeLabel: { type: String, default: '建造单位' },
	/** 右侧收起后贴边条文案（竖排） */
	rightEdgeLabel: { type: String, default: '单位详情' },
})

/** 各边是否处于「仅贴边条」收起态 */
const headerCollapsed = ref(false)
const footerCollapsed = ref(false)
const leftCollapsed = ref(false)
const rightCollapsed = ref(false)
</script>

<template>
	<!-- 根容器：使用 dvh 适配移动端地址栏变化，桌面回退为 screen -->
	<div class="game-container flex flex-col h-[100dvh] md:h-screen overflow-hidden">
		<!-- ========== 顶部 ========== -->
		<header
			v-if="!headerCollapsed"
			class="app-layout-panel-edge relative flex min-h-0 flex-none flex-col border-b border-white/10 bg-zinc-950/90"
		>
			<div class="min-h-0 flex-1 overflow-auto">
				<slot name="header" />
			</div>
			<button
				type="button"
				class="app-layout-collapse-handle app-layout-collapse-handle--header app-layout-collapse-tb app-layout-opacity-btn pointer-events-auto absolute bottom-0 left-1/2 z-20 flex -translate-x-1/2 items-center justify-center rounded-md border border-white/15 bg-zinc-900 text-sm text-white shadow-md backdrop-blur-sm transition-colors hover:bg-zinc-800"
				aria-expanded="true"
				:aria-label="`收起顶部：${props.headerEdgeLabel}`"
				@click="headerCollapsed = true"
			>
				<span aria-hidden="true" class="block leading-none">▲</span>
			</button>
		</header>
		<button
			v-else
			type="button"
			class="app-layout-edge-strip app-layout-edge-strip--top app-layout-opacity-btn flex-none flex h-9 w-full shrink-0 flex-row items-center justify-center gap-2 border-b border-white/10 bg-zinc-950 text-sm text-white/90 shadow-md backdrop-blur-sm transition-colors hover:bg-zinc-900"
			aria-expanded="false"
			:aria-label="`展开顶部：${props.headerEdgeLabel}`"
			@click="headerCollapsed = false"
		>
			<!-- 箭头在文字左侧：▼ 表示可向下展开顶部区块 -->
			<span class="shrink-0 text-xs leading-none" aria-hidden="true">▼</span>
			<span>{{ props.headerEdgeLabel }}</span>
		</button>

		<!-- ========== 主体：左 | 中 | 右 ========== -->
		<div class="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
			<!-- 左侧 -->
			<aside
				v-if="!leftCollapsed"
				class="app-layout-panel-edge relative order-1 flex min-h-0 w-full shrink-0 flex-col border-r border-white/10 bg-zinc-950/90 md:order-1 md:w-1/6"
			>
				<div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
					<slot name="left" />
				</div>
				<button
					type="button"
					class="app-layout-collapse-handle app-layout-collapse-handle--left app-layout-collapse-lr app-layout-opacity-btn pointer-events-auto absolute right-0 top-1/2 z-50 flex -translate-y-1/2 items-center justify-center rounded-md border border-white/15 bg-zinc-900 text-sm text-white shadow-md backdrop-blur-sm transition-colors hover:bg-zinc-800"
					aria-expanded="true"
					:aria-label="`收起左侧：${props.leftEdgeLabel}`"
					@click="leftCollapsed = true"
				>
					<span aria-hidden="true" class="block leading-none">◀</span>
				</button>
			</aside>
			<button
				v-else
				type="button"
				class="app-layout-edge-strip app-layout-edge-strip--left app-layout-opacity-btn order-1 flex min-h-10 w-full shrink-0 flex-col items-center justify-center gap-1 border-r border-white/10 bg-zinc-950 py-1 text-sm text-white/90 shadow-md backdrop-blur-sm transition-colors hover:bg-zinc-900 md:order-1 md:h-full md:min-h-0 md:w-11 md:gap-2 md:py-3"
				aria-expanded="false"
				:aria-label="`展开左侧：${props.leftEdgeLabel}`"
				@click="leftCollapsed = false"
			>
				<!-- 箭头在文字上侧：▶ 表示可向右展开左侧区块 -->
				<span class="shrink-0 text-xs leading-none" aria-hidden="true">▶</span>
				<span class="layout-edge-label-vertical text-center">{{ props.leftEdgeLabel }}</span>
			</button>

			<!-- 中间 3D -->
			<section class="order-3 flex min-h-0 min-w-0 flex-1 flex-col md:order-2">
				<div class="relative h-full min-h-0 min-w-0 overflow-hidden industrial-panel shadow-industrial">
					<slot name="main" />
				</div>
			</section>

			<!-- 右侧 -->
			<aside
				v-if="!rightCollapsed"
				class="app-layout-panel-edge relative order-2 flex min-h-0 w-full shrink-0 flex-col border-l border-white/10 bg-zinc-950/90 md:order-3 md:w-1/6"
			>
				<!-- 内容在前、箭头在后，避免后绘制的全宽侧栏盖住绝对定位按钮（BuildingDetails 根节点 z-40） -->
				<div class="min-h-0 min-w-0 flex-1 overflow-y-auto">
					<slot name="right" />
				</div>
				<button
					type="button"
					class="app-layout-collapse-handle app-layout-collapse-handle--right app-layout-collapse-lr app-layout-opacity-btn pointer-events-auto absolute left-0 top-1/2 z-50 flex -translate-y-1/2 items-center justify-center rounded-md border border-white/15 bg-zinc-900 text-sm text-white shadow-md backdrop-blur-sm transition-colors hover:bg-zinc-800"
					aria-expanded="true"
					:aria-label="`收起右侧：${props.rightEdgeLabel}`"
					@click="rightCollapsed = true"
				>
					<span aria-hidden="true" class="block leading-none">▶</span>
				</button>
			</aside>
			<button
				v-else
				type="button"
				class="app-layout-edge-strip app-layout-edge-strip--right app-layout-opacity-btn order-2 flex min-h-10 w-full shrink-0 flex-col items-center justify-center gap-1 border-l border-white/10 bg-zinc-950 py-1 text-sm text-white/90 shadow-md backdrop-blur-sm transition-colors hover:bg-zinc-900 md:order-3 md:h-full md:min-h-0 md:w-11 md:gap-2 md:py-3"
				aria-expanded="false"
				:aria-label="`展开右侧：${props.rightEdgeLabel}`"
				@click="rightCollapsed = false"
			>
				<!-- 箭头在文字上侧：◀ 表示可向左展开右侧区块 -->
				<span class="shrink-0 text-xs leading-none" aria-hidden="true">◀</span>
				<span class="layout-edge-label-vertical text-center">{{ props.rightEdgeLabel }}</span>
			</button>
		</div>

		<!-- ========== 底部 ========== -->
		<footer
			v-if="!footerCollapsed"
			class="app-layout-panel-edge relative flex min-h-0 flex-none flex-col border-t border-white/10 bg-zinc-950/90"
		>
			<button
				type="button"
				class="app-layout-collapse-handle app-layout-collapse-handle--footer app-layout-collapse-tb app-layout-opacity-btn pointer-events-auto absolute left-1/2 top-0 z-20 flex -translate-x-1/2 items-center justify-center rounded-md border border-white/15 bg-zinc-900 text-sm text-white shadow-md backdrop-blur-sm transition-colors hover:bg-zinc-800"
				aria-expanded="true"
				:aria-label="`收起底部：${props.footerEdgeLabel}`"
				@click="footerCollapsed = true"
			>
				<span aria-hidden="true" class="block leading-none">▼</span>
			</button>
			<div class="min-h-0 flex-1 overflow-auto">
				<slot name="footer" />
			</div>
		</footer>
		<button
			v-else
			type="button"
			class="app-layout-edge-strip app-layout-edge-strip--bottom app-layout-opacity-btn flex-none flex h-9 w-full shrink-0 flex-row items-center justify-center gap-2 border-t border-white/10 bg-zinc-950 text-sm text-white/90 shadow-md backdrop-blur-sm transition-colors hover:bg-zinc-900"
			aria-expanded="false"
			:aria-label="`展开底部：${props.footerEdgeLabel}`"
			@click="footerCollapsed = false"
		>
			<!-- 箭头在文字左侧：▲ 表示可向上展开底部区块 -->
			<span class="shrink-0 text-xs leading-none" aria-hidden="true">▲</span>
			<span>{{ props.footerEdgeLabel }}</span>
		</button>

		<!-- 全局覆盖层（不拦截事件，子层自行开启 pointer-events） -->
		<div class="fixed inset-0 z-40 pointer-events-none">
			<slot name="overlays" />
		</div>
	</div>
</template>

<style scoped>
/* 整块 button 半透明；悬停、聚焦、按下时不透明（背景用实色，由 opacity 统一变淡） */
.app-layout-opacity-btn {
	opacity: 0.35;
	transition:
		opacity 0.15s ease,
		background-color 0.15s ease;
}
.app-layout-opacity-btn:hover,
.app-layout-opacity-btn:focus-visible,
.app-layout-opacity-btn:active {
	opacity: 1;
}

/* 顶/底收起按钮：同宽同高（与 Tailwind h-7 w-11 一致） */
.app-layout-collapse-tb {
	width: 2.75rem; /* 11 * 0.25rem = w-11 */
	height: 1.75rem; /* 7 * 0.25rem = h-7 */
}

/* 左/右收起按钮：同宽同高，且为顶/底的宽高互换 */
.app-layout-collapse-lr {
	width: 1.75rem; /* = 顶/底之高 h-7 */
	height: 2.75rem; /* = 顶/底之宽 w-11 */
}

/* 竖排贴边文案（md+ 左右收起条内文字；窄屏仍为横排） */
@media (min-width: 768px) {
	.layout-edge-label-vertical {
		writing-mode: vertical-rl;
		text-orientation: mixed;
		letter-spacing: 0.08em;
	}
}
</style>
