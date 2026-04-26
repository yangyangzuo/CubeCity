import * as THREE from "three";
import SimObject from "./sim-object.js";
import Experience from "../../experience.js";

// TileInstancedLayer：实例化地皮层，继承 SimObject 以对齐组件体系
export default class TileInstancedLayer extends SimObject {
	constructor({ size, baseColor = "#ffffff", meta = [], matrix = new THREE.Matrix4() } = {}) {
		super(0, 0, null);
		this.name = "TileInstancedLayer";
		this.size = size;
		this.baseColor = baseColor;
		this.meta = meta;
		this.reusableMatrix = matrix;

		// this.experience = new Experience();
		// this.debug = this.experience.debug;
		// this.debugActive = this.experience.debug.active;
		// this.setDebug();

		// 交互与运行时数据
		this.raycaster = new THREE.Raycaster();
		this.matrix = new THREE.Matrix4();
		this.positionCache = new THREE.Vector3();
		this.quaternionCache = new THREE.Quaternion();
		this.scaleCache = new THREE.Vector3();
		this.hoverPoint = new THREE.Vector3();
		this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
		this.hoveredInstanceId = -1;
		this.tilePositions = [];

		// 视觉对象
		this.instancedGrass = null;
		this.hoverOverlay = null;
		this.layerGroup = new THREE.Group();
		this.layerGroup.name = "TileInstancedLayerGroup";
		this.add(this.layerGroup);

		this.rebuild({ size: this.size, baseColor: this.baseColor, meta: this.meta });
	}

	setDebug() {
		if (this.debugActive) {
			const folder = this.debug.ui.addFolder({ title: "地皮颜色", expanded: false });
			folder
				.addBinding(this.params, "color", {
					view: "color",
					label: "地皮颜色",
				})
				.on("change", (ev) => {
					this.setAllColor(ev.value);
				});
		}
	}

	// 重建实例层，供 City 在尺寸或元数据变化时调用
	rebuild({ size = this.size, baseColor = this.baseColor, meta = this.meta } = {}) {
		this.size = size;
		this.baseColor = baseColor;
		this.meta = meta;
		this.hoveredInstanceId = -1;
		this.tilePositions = [];
		this.clearLayer();

		// 地皮基础体改为 BoxGeometry，不再依赖外部加载模型
		const tileTemplate = this.createTileTemplate();
		const instancedGeometry = tileTemplate.geometry;
		const grassMaterial = tileTemplate.material;

		const count = this.size * this.size;
		this.instancedGrass = new THREE.InstancedMesh(instancedGeometry, grassMaterial, count);
		this.instancedGrass.name = "city-grass-instanced";
		this.instancedGrass.castShadow = true;
		this.instancedGrass.receiveShadow = true;
		this.enablePerInstancePBR(this.instancedGrass, grassMaterial, count);

		const color = new THREE.Color(this.baseColor);
		for (let i = 0; i < count; i++) {
			this.instancedGrass.setColorAt(i, color);
		}
		this.instancedGrass.instanceColor.needsUpdate = true;

		let instanceId = 0;
		const half = (this.size - 1) / 2;
		for (let x = 0; x < this.size; x++) {
			for (let y = 0; y < this.size; y++) {
				const px = x - half;
				const pz = y - half;
				this.reusableMatrix.makeTranslation(px, 0, pz);
				this.instancedGrass.setMatrixAt(instanceId, this.reusableMatrix);
				this.tilePositions[instanceId] = { x, y, px, pz, meta: this.meta[x]?.[y] };
				instanceId++;
			}
		}
		this.instancedGrass.instanceMatrix.needsUpdate = true;

		// 高亮层复用同一基础几何，保证与地皮形状一致
		const hoverGeometry = instancedGeometry.clone();
		this.hoverOverlay = new THREE.Mesh(
			hoverGeometry,
			new THREE.MeshStandardMaterial({
				color: "#ff0000",
				transparent: true,
				opacity: 0.45,
				depthWrite: false,
			}),
		);
		this.hoverOverlay.visible = false;
		this.hoverOverlay.position.y = 0.12;
		this.hoverOverlay.name = "city-hover-overlay";

		this.layerGroup.add(this.instancedGrass);
		this.layerGroup.add(this.hoverOverlay);
	}

	// 批量修改实例颜色（用于调试面板调色）
	setAllColor(color) {
		this.baseColor = color;
		if (!this.instancedGrass) {
			return;
		}
		const newColor = new THREE.Color(color);
		for (let i = 0; i < this.instancedGrass.count; i++) {
			this.instancedGrass.setColorAt(i, newColor);
		}
		this.instancedGrass.instanceColor.needsUpdate = true;
	}

	// 每帧更新悬停状态
	updateHover(iMouse, camera) {
		if (!this.instancedGrass || !this.hoverOverlay) {
			this.hoveredInstanceId = -1;
			return -1;
		}
		this.raycaster.setFromCamera(iMouse.normalizedMouse, camera);
		const hasPoint = this.raycaster.ray.intersectPlane(this.groundPlane, this.hoverPoint);
		if (!hasPoint) {
			this.hoveredInstanceId = -1;
			this.hoverOverlay.visible = false;
			return -1;
		}
		const half = (this.size - 1) / 2;
		const min = -half - 0.5;
		const max = half + 0.5;
		if (this.hoverPoint.x < min || this.hoverPoint.x > max || this.hoverPoint.z < min || this.hoverPoint.z > max) {
			this.hoveredInstanceId = -1;
			this.hoverOverlay.visible = false;
			return -1;
		}
		const gridX = Math.round(this.hoverPoint.x + half);
		const gridY = Math.round(this.hoverPoint.z + half);
		const instanceId = gridX * this.size + gridY;
		this.hoveredInstanceId = instanceId;
		this.instancedGrass.getMatrixAt(instanceId, this.matrix);
		this.matrix.decompose(this.positionCache, this.quaternionCache, this.scaleCache);
		this.hoverOverlay.visible = true;
		this.hoverOverlay.position.set(this.positionCache.x, 0.12, this.positionCache.z);
		return instanceId;
	}

	// 与 City 更新体系对齐
	update(iMouse, camera) {
		this.updateHover(iMouse, camera);
	}

	// 清理实例层内容
	clearLayer() {
		if (this.layerGroup.children.length === 0) {
			return;
		}
		this.layerGroup.traverse((obj) => {
			if (obj.geometry) {
				obj.geometry.dispose?.();
			}
			if (obj.material) {
				if (Array.isArray(obj.material)) {
					obj.material.forEach((material) => material?.dispose?.());
				} else {
					obj.material.dispose?.();
				}
			}
		});
		this.layerGroup.clear();
		this.instancedGrass = null;
		this.hoverOverlay = null;
	}

	// 销毁时释放 GPU 资源
	dispose() {
		this.clearLayer();
	}

	// 创建地皮基础模板（统一几何与材质）
	createTileTemplate() {
		// 这里使用 BoxGeometry 作为地皮形状，后续实例与高亮都复用该几何
		const geometry = new THREE.BoxGeometry(0.98, 0.2, 0.98);
		// 使用独立材质对象，便于后续做实例化 PBR 注入
		const material = new THREE.MeshStandardMaterial({
			color: "#ffffff",
			metalness: 1.0,
			roughness: 1.0,
		});
		return { geometry, material };
	}

	// 为 InstancedMesh 注入每实例 PBR 参数（metalness/roughness）
	enablePerInstancePBR(instancedMesh, material, count) {
		const metalnessArray = new Float32Array(count);
		const roughnessArray = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			metalnessArray[i] = Math.random() * 0.5;
			roughnessArray[i] = Math.random() * 0.5;
		}
		instancedMesh.geometry.setAttribute("instanceMetalness", new THREE.InstancedBufferAttribute(metalnessArray, 1));
		instancedMesh.geometry.setAttribute("instanceRoughness", new THREE.InstancedBufferAttribute(roughnessArray, 1));
		material.onBeforeCompile = (shader) => {
			shader.vertexShader =
				`
					attribute float instanceMetalness;
					attribute float instanceRoughness;
					varying float vInstanceMetalness;
					varying float vInstanceRoughness;
				` + shader.vertexShader;
			shader.vertexShader = shader.vertexShader.replace(
				"#include <begin_vertex>",
				`
					vInstanceMetalness = instanceMetalness;
					vInstanceRoughness = instanceRoughness;
					#include <begin_vertex>
				`,
			);
			shader.fragmentShader =
				`
				varying float vInstanceMetalness;
				varying float vInstanceRoughness;
			` + shader.fragmentShader;
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <roughnessmap_fragment>",
				`
					#include <roughnessmap_fragment>
					roughnessFactor *= clamp(vInstanceRoughness, 0.0, 1.0);
				`,
			);
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <metalnessmap_fragment>",
				`
					#include <metalnessmap_fragment>
					metalnessFactor *= clamp(vInstanceMetalness, 0.0, 1.0);
				`,
			);
		};
		material.needsUpdate = true;
	}
}
