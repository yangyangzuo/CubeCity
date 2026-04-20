import EventEmitter from "./event-emitter.js";

export default class Sizes extends EventEmitter {
	/**
	 * 初始化尺寸管理器
	 * @param {HTMLElement} [element] - 可选的DOM元素,用于获取宽高
	 */
	constructor(element) {
		super();

		// 设置目标元素（传入 canvas 时，按父容器尺寸计算）
		this.element = element || window;
		this.targetElement = this.resolveTargetElement(this.element);

		// 初始化尺寸
		this.updateSizes();

		// 监听容器尺寸变化（例如侧边栏伸缩、布局切换等）
		if (this.targetElement !== window && typeof ResizeObserver !== "undefined") {
			this.resizeObserver = new ResizeObserver(() => {
				this.updateSizes();
				// 通知 相机和渲染器 更新尺寸
				this.trigger("resize");
			});
			this.resizeObserver.observe(this.targetElement);
		}
	}

	/**
	 * 更新尺寸属性
	 */
	updateSizes() {
		if (this.targetElement === window) {
			this.width = window.innerWidth;
			this.height = window.innerHeight;
		} else {
			// 优先使用渲染盒模型尺寸，避免 offset 在部分布局阶段取值不准
			const rect = this.targetElement.getBoundingClientRect();
			this.width = rect.width || this.targetElement.clientWidth || window.innerWidth;
			this.height = rect.height || this.targetElement.clientHeight || window.innerHeight;
		}
		// 避免高度为 0 导致宽高比异常（Infinity/NaN）
		this.aspect = this.width / Math.max(this.height, 1);
		// 比如手机 DPR=3，如果不限制，实际渲染像素可能是屏幕像素的 9 倍量级，性能压力很大
		// 限制为 1.5-2 之间比较合理
		this.pixelRatio = Math.min(window.devicePixelRatio, 1.5);
	}

	/**
	 * 解析真正用于计算尺寸的目标元素
	 * - window: 直接使用视口
	 * - canvas: 使用其父容器，保证 canvas 跟随容器铺满
	 * - 其他元素: 使用元素自身
	 */
	resolveTargetElement(element) {
		if (!element || element === window) {
			return window;
		}

		if (element instanceof HTMLCanvasElement) {
			return element.parentElement || element;
		}

		return element;
	}
}
