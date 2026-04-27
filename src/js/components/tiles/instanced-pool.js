import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const HIDDEN_SCALE = 0.0001;
const DEFAULT_OPACITY = 1.0;
const DEFAULT_EMISSIVE = new THREE.Color(0x000000);
const ROAD_INSTANCE_DEBUG = true;

// 统一实例化池：管理地块与建筑的 InstancedMesh 分配/回收与可视属性
// 如果一个模型，有3个子对象，你是怎么实例化的，会把这个模型的3个子对象mesh都进行实例化吗

// 会，当前实现是这样的：

// 会遍历这个模型下所有 THREE.Mesh 子对象。
// 按“材质”分组（同材质的子网格归一组）。
// 每一组先做几何合并（mergeGeometries），然后创建一个 InstancedMesh。
// 所以如果 3 个子对象材质都不同，通常会变成 3 个 InstancedMesh；如果材质相同，可能会合并成更少（比如 1 个）。
// 也就是说不是只实例化第一个子对象，而是把该模型的子 mesh 都纳入实例化，只是为了保留材质正确性，按材质拆成多个池内 mesh。
// 方式1: 对象没有动画，可以把子对象合并，只实例化一个 InstancedMesh
// 方式2: 对象没有动画，也可以把每个子对象实例化(然后合并成一个 InstancedMesh?)
// 方式3: 对象有动画，不能合并，把动画部分的mesh抽离出来，单独实例化
export default class InstancedPool {
	constructor(scene, { maxInstances = 2048 } = {}) {
		this.scene = scene;
		this.maxInstances = maxInstances;
		this.root = new THREE.Group();
		this.root.name = "InstancedPoolRoot";
		this.scene.add(this.root);

		this.pools = new Map();
		this.tmpMatrix = new THREE.Matrix4();
		this.tmpPosition = new THREE.Vector3();
		this.tmpQuaternion = new THREE.Quaternion();
		this.tmpScale = new THREE.Vector3(1, 1, 1);

		this.stats = {
			totalPools: 0,
			totalCapacity: 0,
			usedInstances: 0,
			matrixUpdates: 0,
		};
	}

	/** 克隆 glTF 材质并注入实例 opacity / emissive，供 InstancedMesh 使用 */
	#cloneMaterialForInstancing(baseMaterial) {
		const sharedMaterial = baseMaterial.clone();
		sharedMaterial.transparent = true;
		sharedMaterial.depthWrite = true;
		sharedMaterial.onBeforeCompile = (shader) => {
			shader.vertexShader = `
attribute float instanceOpacity;
attribute vec3 instanceEmissive;
varying float vInstanceOpacity;
varying vec3 vInstanceEmissive;
` + shader.vertexShader;
			shader.vertexShader = shader.vertexShader.replace(
				"#include <begin_vertex>",
				`
vInstanceOpacity = instanceOpacity;
vInstanceEmissive = instanceEmissive;
#include <begin_vertex>
`,
			);
			shader.fragmentShader = `
varying float vInstanceOpacity;
varying vec3 vInstanceEmissive;
` + shader.fragmentShader;
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <color_fragment>",
				`
#include <color_fragment>
diffuseColor.a *= clamp(vInstanceOpacity, 0.0, 1.0);
`,
			);
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <emissivemap_fragment>",
				`
#include <emissivemap_fragment>
totalEmissiveRadiance += vInstanceEmissive;
`,
			);
		};
		sharedMaterial.needsUpdate = true;
		return sharedMaterial;
	}

	// 从 glTF 资源注册实例池，可用 meshFilter 按子网格名拆分（如风机塔身/扇叶）
	registerFromResource(resourceName, resource, capacity = this.maxInstances, { meshFilter } = {}) {
		if (!resource?.scene || this.pools.has(resourceName)) {
			return;
		}
		const meshTemplates = [];
		resource.scene.updateWorldMatrix(true, true);
		resource.scene.traverse((child) => {
			if (
				child instanceof THREE.Mesh
				&& child.geometry
				&& child.material
				// 允许调用方按需筛选子网格，未传时默认收集全部 Mesh
				&& (!meshFilter || meshFilter(child))
			) {
				meshTemplates.push(child);
			}
		});
		if (!meshTemplates.length) {
			return;
		}

		const entry = {
			resourceName,
			capacity,
			meshes: [],
			sharedMaterial: null,
			freeList: [],
			used: new Set(),
			state: {
				visible: new Array(capacity).fill(false),
				position: new Array(capacity).fill(null).map(() => new THREE.Vector3(0, 0, 0)),
				quaternion: new Array(capacity).fill(null).map(() => new THREE.Quaternion()),
				scale: new Array(capacity).fill(null).map(() => new THREE.Vector3(1, 1, 1)),
				color: new Array(capacity).fill(null).map(() => new THREE.Color(0xffffff)),
				opacity: new Float32Array(capacity).fill(DEFAULT_OPACITY),
				emissive: new Array(capacity).fill(null).map(() => DEFAULT_EMISSIVE.clone()),
			},
		};

		// 逆序入栈，保证 pop() 时优先分配低索引（0,1,2...）
		// 这样可让 drawCount 更贴近真实活跃数量
		for (let i = capacity - 1; i >= 0; i--) {
			entry.freeList.push(i);
		}

		// 按材质分组：多子网格 glTF 若合并后共用首个材质，会导致树叶绿/树干黄等贴图错乱
		const materialGroups = new Map();
		for (const template of meshTemplates) {
			const mat = Array.isArray(template.material) ? template.material[0] : template.material;
			const key = mat.uuid;
			if (!materialGroups.has(key)) {
				materialGroups.set(key, { templateMaterial: mat, templates: [] });
			}
			materialGroups.get(key).templates.push(template);
		}

		let meshIndex = 0;
		for (const { templateMaterial, templates } of materialGroups.values()) {
			const sharedMaterial = this.#cloneMaterialForInstancing(templateMaterial);
			const geometriesToMerge = templates.map((template) => {
				const geometry = template.geometry.clone();
				geometry.applyMatrix4(template.matrixWorld);
				return geometry.toNonIndexed();
			});
			let mergedGeometry = mergeGeometries(geometriesToMerge, false);
			if (!mergedGeometry) {
				mergedGeometry = geometriesToMerge[0];
			}

			mergedGeometry.setAttribute(
				"instanceOpacity",
				new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(DEFAULT_OPACITY), 1),
			);
			mergedGeometry.setAttribute(
				"instanceEmissive",
				new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(0), 3),
			);

			const instancedMesh = new THREE.InstancedMesh(mergedGeometry, sharedMaterial, capacity);
			instancedMesh.name = `pool-${resourceName}-${meshIndex}`;
			meshIndex += 1;
			instancedMesh.castShadow = true;
			instancedMesh.receiveShadow = true;
			instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			instancedMesh.count = 0;

			for (let i = 0; i < capacity; i++) {
				this.tmpMatrix.compose(
					this.tmpPosition.set(0, -9999, 0),
					this.tmpQuaternion.identity(),
					this.tmpScale.set(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE),
				);
				instancedMesh.setMatrixAt(i, this.tmpMatrix);
				instancedMesh.setColorAt(i, new THREE.Color(0xffffff));
			}
			instancedMesh.instanceMatrix.needsUpdate = true;
			instancedMesh.instanceColor.needsUpdate = true;
			instancedMesh.frustumCulled = false;
			this.root.add(instancedMesh);
			entry.meshes.push(instancedMesh);
		}

		entry.sharedMaterial = entry.meshes[0]?.material ?? null;

		this.pools.set(resourceName, entry);
		this.stats.totalPools += 1;
		this.stats.totalCapacity += capacity;
	}

	// 注册基础几何实例池（用于轻量自建模型，如草地）
	registerPrimitive(resourceName, { geometry, material }, capacity = this.maxInstances) {
		if (this.pools.has(resourceName) || !geometry || !material) {
			return;
		}
		const entry = {
			resourceName,
			capacity,
			meshes: [],
			sharedMaterial: null,
			freeList: [],
			used: new Set(),
			state: {
				visible: new Array(capacity).fill(false),
				position: new Array(capacity).fill(null).map(() => new THREE.Vector3(0, 0, 0)),
				quaternion: new Array(capacity).fill(null).map(() => new THREE.Quaternion()),
				scale: new Array(capacity).fill(null).map(() => new THREE.Vector3(1, 1, 1)),
				color: new Array(capacity).fill(null).map(() => new THREE.Color(0xffffff)),
				opacity: new Float32Array(capacity).fill(DEFAULT_OPACITY),
				emissive: new Array(capacity).fill(null).map(() => DEFAULT_EMISSIVE.clone()),
			},
		};
		// 逆序入栈，保证 pop() 时优先分配低索引（0,1,2...）
		for (let i = capacity - 1; i >= 0; i--) {
			entry.freeList.push(i);
		}

		const sharedMaterial = material.clone();
		sharedMaterial.transparent = true;
		sharedMaterial.depthWrite = true;
		sharedMaterial.onBeforeCompile = (shader) => {
			shader.vertexShader = `
attribute float instanceOpacity;
attribute vec3 instanceEmissive;
attribute float instanceMetalness;
attribute float instanceRoughness;
varying float vInstanceOpacity;
varying vec3 vInstanceEmissive;
varying float vInstanceMetalness;
varying float vInstanceRoughness;
` + shader.vertexShader;
			shader.vertexShader = shader.vertexShader.replace(
				"#include <begin_vertex>",
				`
vInstanceOpacity = instanceOpacity;
vInstanceEmissive = instanceEmissive;
vInstanceMetalness = instanceMetalness;
vInstanceRoughness = instanceRoughness;
#include <begin_vertex>
`,
			);
			shader.fragmentShader = `
varying float vInstanceOpacity;
varying vec3 vInstanceEmissive;
varying float vInstanceMetalness;
varying float vInstanceRoughness;
` + shader.fragmentShader;
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <color_fragment>",
				`
#include <color_fragment>
diffuseColor.a *= clamp(vInstanceOpacity, 0.0, 1.0);
`,
			);
			shader.fragmentShader = shader.fragmentShader.replace(
				"#include <emissivemap_fragment>",
				`
#include <emissivemap_fragment>
totalEmissiveRadiance += vInstanceEmissive;
`,
			);
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
		sharedMaterial.needsUpdate = true;
		entry.sharedMaterial = sharedMaterial;

		const instancedGeometry = geometry.clone();
		instancedGeometry.setAttribute("instanceOpacity", new THREE.InstancedBufferAttribute(new Float32Array(capacity).fill(DEFAULT_OPACITY), 1));
		instancedGeometry.setAttribute("instanceEmissive", new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(0), 3));
		// 为每个实例写入随机 PBR 参数（0~1），增强差异化可见性
		const metalnessArray = new Float32Array(capacity);
		const roughnessArray = new Float32Array(capacity);
		for (let i = 0; i < capacity; i++) {
			metalnessArray[i] = Math.random();
			roughnessArray[i] = Math.random();
		}
		instancedGeometry.setAttribute("instanceMetalness", new THREE.InstancedBufferAttribute(metalnessArray, 1));
		instancedGeometry.setAttribute("instanceRoughness", new THREE.InstancedBufferAttribute(roughnessArray, 1));

		const instancedMesh = new THREE.InstancedMesh(instancedGeometry, sharedMaterial, capacity);
		instancedMesh.name = `pool-${resourceName}-0`;
		instancedMesh.castShadow = true;
		instancedMesh.receiveShadow = true;
		instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		// 仅绘制活跃实例，初始为 0（空占位不提交）
		instancedMesh.count = 0;

		for (let i = 0; i < capacity; i++) {
			this.tmpMatrix.compose(
				this.tmpPosition.set(0, -9999, 0),
				this.tmpQuaternion.identity(),
				this.tmpScale.set(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE),
			);
			instancedMesh.setMatrixAt(i, this.tmpMatrix);
			instancedMesh.setColorAt(i, new THREE.Color(0xffffff));
		}
		instancedMesh.instanceMatrix.needsUpdate = true;
		instancedMesh.instanceColor.needsUpdate = true;
		instancedMesh.frustumCulled = false;
		this.root.add(instancedMesh);
		entry.meshes.push(instancedMesh);

		this.pools.set(resourceName, entry);
		this.stats.totalPools += 1;
		this.stats.totalCapacity += capacity;
	}

	allocate(resourceName, initialState = {}) {
		const entry = this.pools.get(resourceName);
		if (!entry || !entry.freeList.length) {
			return null;
		}
		const instanceId = entry.freeList.pop();
		entry.used.add(instanceId);
		// 扩展绘制区间到当前最大活跃索引
		const nextDrawCount = instanceId + 1;
		entry.meshes.forEach((mesh) => {
			if (mesh.count < nextDrawCount) {
				mesh.count = nextDrawCount;
			}
		});
		this.stats.usedInstances += 1;
		this.updateState(resourceName, instanceId, {
			visible: true,
			position: initialState.position,
			quaternion: initialState.quaternion,
			scale: initialState.scale,
			color: initialState.color,
			opacity: initialState.opacity,
			emissive: initialState.emissive,
		});
		return { resourceName, instanceId };
	}

	free(handle) {
		if (!handle) {
			return;
		}
		const entry = this.pools.get(handle.resourceName);
		if (!entry || !entry.used.has(handle.instanceId)) {
			return;
		}
		entry.used.delete(handle.instanceId);
		entry.freeList.push(handle.instanceId);
		this.stats.usedInstances = Math.max(0, this.stats.usedInstances - 1);
		this.updateState(handle.resourceName, handle.instanceId, {
			visible: false,
			opacity: DEFAULT_OPACITY,
			emissive: DEFAULT_EMISSIVE,
			color: 0xffffff,
		});
		// 收缩绘制区间：仅当释放的是末尾活跃索引时才向前压缩
		let drawCount = entry.meshes[0]?.count ?? 0;
		while (drawCount > 0 && !entry.used.has(drawCount - 1)) {
			drawCount--;
		}
		entry.meshes.forEach((mesh) => {
			mesh.count = drawCount;
		});
	}

	updateTransform(handle, { position, quaternion, scale } = {}) {
		if (!handle) {
			return;
		}
		this.updateState(handle.resourceName, handle.instanceId, { position, quaternion, scale });
	}

	updateColor(handle, color) {
		if (!handle) {
			return;
		}
		this.updateState(handle.resourceName, handle.instanceId, { color });
	}

	updateOpacity(handle, opacity) {
		if (!handle) {
			return;
		}
		this.updateState(handle.resourceName, handle.instanceId, { opacity });
	}

	updateEmissive(handle, emissive) {
		if (!handle) {
			return;
		}
		this.updateState(handle.resourceName, handle.instanceId, { emissive });
	}

	setVisible(handle, visible) {
		if (!handle) {
			return;
		}
		this.updateState(handle.resourceName, handle.instanceId, { visible });
	}

	updateState(resourceName, instanceId, partialState = {}) {
		const entry = this.pools.get(resourceName);
		if (!entry || instanceId < 0 || instanceId >= entry.capacity) {
			return;
		}
		const state = entry.state;
		if (partialState.position) {
			state.position[instanceId].copy(partialState.position);
		}
		if (partialState.quaternion) {
			state.quaternion[instanceId].copy(partialState.quaternion);
		}
		if (partialState.scale) {
			state.scale[instanceId].copy(partialState.scale);
		}
		if (partialState.color !== undefined) {
			state.color[instanceId].set(partialState.color);
		}
		if (partialState.opacity !== undefined) {
			state.opacity[instanceId] = partialState.opacity;
		}
		if (partialState.emissive !== undefined) {
			state.emissive[instanceId].set(partialState.emissive);
		}
		if (partialState.visible !== undefined) {
			state.visible[instanceId] = partialState.visible;
		}

		this.#flushInstance(entry, instanceId);
	}

	#flushInstance(entry, instanceId) {
		const state = entry.state;
		const visible = state.visible[instanceId];
		const finalScale = visible ? state.scale[instanceId] : this.tmpScale.set(HIDDEN_SCALE, HIDDEN_SCALE, HIDDEN_SCALE);
		const finalPosition = visible ? state.position[instanceId] : this.tmpPosition.set(0, -9999, 0);

		this.tmpMatrix.compose(finalPosition, state.quaternion[instanceId], finalScale);
		entry.meshes.forEach((mesh) => {
			mesh.setMatrixAt(instanceId, this.tmpMatrix);
			mesh.setColorAt(instanceId, state.color[instanceId]);

			const opacityAttr = mesh.geometry.getAttribute("instanceOpacity");
			opacityAttr.setX(instanceId, state.opacity[instanceId]);
			opacityAttr.needsUpdate = true;

			const emissiveAttr = mesh.geometry.getAttribute("instanceEmissive");
			const emissiveColor = state.emissive[instanceId];
			emissiveAttr.setXYZ(instanceId, emissiveColor.r, emissiveColor.g, emissiveColor.b);
			emissiveAttr.needsUpdate = true;

			mesh.instanceMatrix.needsUpdate = true;
			mesh.instanceColor.needsUpdate = true;
		});
		this.stats.matrixUpdates += 1;
	}

	dispose() {
		this.pools.forEach((entry) => {
			const disposedMaterials = new Set();
			entry.meshes.forEach((mesh) => {
				mesh.geometry?.dispose?.();
				const mat = mesh.material;
				if (mat && !disposedMaterials.has(mat)) {
					mat.dispose?.();
					disposedMaterials.add(mat);
				}
				this.root.remove(mesh);
			});
			entry.sharedMaterial = null;
		});
		this.pools.clear();
		this.scene.remove(this.root);
	}
}
