<script setup>
import { ref } from "vue";

// 控制菜单开关：仅在配置组件内部使用
const showConfigMenu = ref(false);

// 从父组件接收四个区域显隐状态
const props = defineProps({
	showHeader: {
		type: Boolean,
		required: true,
	},
	showLeft: {
		type: Boolean,
		required: true,
	},
	showRight: {
		type: Boolean,
		required: true,
	},
	showFooter: {
		type: Boolean,
		required: true,
	},
});

// 通过事件把开关变更回传给父组件
const emit = defineEmits([
	"update:showHeader",
	"update:showLeft",
	"update:showRight",
	"update:showFooter",
]);
</script>

<template>
	<div class="relative pointer-events-auto">
		<div
			class="cursor-pointer select-none text-xs md:text-sm font-medium tracking-wide px-3 py-1.5 rounded-md border border-cyan-300/35 bg-slate-900/75 text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.2)] backdrop-blur-sm hover:bg-slate-800/85 hover:border-cyan-200/55 hover:text-cyan-50 transition-all duration-200"
			@click="showConfigMenu = !showConfigMenu"
		>
			配置
		</div>
		<div
			v-if="showConfigMenu"
			class="absolute top-full right-0 mt-2 w-44 rounded-lg border border-cyan-300/25 bg-slate-900/92 text-slate-100 text-xs md:text-sm shadow-[0_10px_28px_rgba(2,6,23,0.7)] backdrop-blur-md p-2.5 space-y-1.5"
		>
			<label class="flex items-center justify-between gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-cyan-300/10 transition-colors">
				<span>header</span>
				<input
					:checked="props.showHeader"
					type="checkbox"
					class="h-4 w-4 rounded border-cyan-200/40 bg-slate-800/80 text-cyan-400 focus:ring-cyan-300/60 focus:ring-2"
					@change="emit('update:showHeader', $event.target.checked)"
				/>
			</label>
			<label class="flex items-center justify-between gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-cyan-300/10 transition-colors">
				<span>left</span>
				<input
					:checked="props.showLeft"
					type="checkbox"
					class="h-4 w-4 rounded border-cyan-200/40 bg-slate-800/80 text-cyan-400 focus:ring-cyan-300/60 focus:ring-2"
					@change="emit('update:showLeft', $event.target.checked)"
				/>
			</label>
			<label class="flex items-center justify-between gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-cyan-300/10 transition-colors">
				<span>right</span>
				<input
					:checked="props.showRight"
					type="checkbox"
					class="h-4 w-4 rounded border-cyan-200/40 bg-slate-800/80 text-cyan-400 focus:ring-cyan-300/60 focus:ring-2"
					@change="emit('update:showRight', $event.target.checked)"
				/>
			</label>
			<label class="flex items-center justify-between gap-2 cursor-pointer rounded px-2 py-1.5 hover:bg-cyan-300/10 transition-colors">
				<span>footer</span>
				<input
					:checked="props.showFooter"
					type="checkbox"
					class="h-4 w-4 rounded border-cyan-200/40 bg-slate-800/80 text-cyan-400 focus:ring-cyan-300/60 focus:ring-2"
					@change="emit('update:showFooter', $event.target.checked)"
				/>
			</label>
		</div>
	</div>
</template>
