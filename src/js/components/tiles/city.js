import {
	BUILD_COLOR,
	BUILD_COLOR_OPACITY,
	BUILD_INVALID_COLOR,
	BUILD_INVALID_COLOR_OPACITY,
	DEMOLISH_COLOR,
	DEMOLISH_COLOR_OPACITY,
	RELOCATE_COLOR,
	RELOCATE_COLOR_OPACITY,
	SELECTED_COLOR,
	SELECTED_COLOR_OPACITY,
	SIMOBJECT_DEFAULT_OPACITY,
} from "@/constants/constants.js";
import { SIZE } from "@/constants/constants.js";
import { useGameState } from "@/stores/useGameState.js";
import { storeToRefs } from "pinia";
import * as THREE from "three";
import Experience from "../../experience.js";
import InstancedPool from "./instanced-pool.js";
import Tile from "./tile.js";

const ROAD_INSTANCE_DEBUG = true;

// City 类，负责管理所有地皮
export default class City {
	constructor() {
		// 获取 Experience 单例
		this.experience = new Experience();
		this.scene = this.experience.scene;
		this.resources = this.experience.resources;
		this.debug = this.experience.debug;
		this.sceneMetadata = this.experience.sceneMetadata;
		// 地皮专用 Group（仅承载逻辑对象，不再承载大量 mesh）
		this.root = new THREE.Group();
		this.root.userData.city = this;
		this.scene.add(this.root);
		// 地皮尺寸
		this.size = SIZE;
		// 当前阶段仅对地皮实例化，建筑保持原 mesh 渲染路径
		this.enableInstancedBuildings = false;
		// 允许道路走实例化渲染
		this.enableInstancedRoad = true;
		// 允许公园走实例化渲染
		this.enableInstancedPark = true;
		// 允许住宅走实例化渲染（house / house2，按需懒加载）
		this.enableInstancedHouse = true;
		// 允许商店与办公室走实例化渲染（shop / office，按需懒加载）
		this.enableInstancedCommercial = true;
		// 允许工业建筑走实例化渲染（factory / chemistry_factory / nuke_factory，按需懒加载）
		this.enableInstancedIndustrial = true;
		// 允许基础设施走实例化渲染（garbage_station / sun_power / water_tower / wind_power，按需懒加载）
		this.enableInstancedInfrastructure = true;
		// 允许公共服务建筑走实例化渲染（hero_park / hospital / police / fire_station，按需懒加载）
		this.enableInstancedPublicService = true;
		// 存储所有 tile 逻辑对象
		this.meshes = [];
		// 统一地皮颜色
		this.params = {
			color: "#8ec07c",
			poolCount: 0,
			poolCapacity: 0,
			poolUsed: 0,
			matrixUpdates: 0,
			hoverTileIndex: -1,
		};

		// 实例化池：统一托管地皮与建筑实例
		this.instancedPool = new InstancedPool(this.scene, { maxInstances: this.size * this.size + 256 });
		// 为交互命中准备的 tile 快速索引
		this.tileByIndex = new Map();
		// 悬停/选中统计
		this.hoverTileIndex = -1;
		this.selectedTileIndex = -1;

		// 资源加载完成后立刻建立实例池
		this.#registerResourcePools();

		// 初始化地皮
		this.initTiles();

		// 调试面板
		if (this.debug.active) {
			this.debugInit();
		}
	}

	// 初始化 17x17 地皮，分布在 XOZ 平面 -8~+8
	initTiles() {
		// 先释放旧 tile（含建筑实例与状态图标锚点），避免扩图时 billboard 残留叠加
		if (this.meshes?.length) {
			for (const row of this.meshes) {
				for (const tile of row) {
					tile?.dispose?.();
				}
			}
		}
		// 规模变化时重建实例池，确保容量与 size 对齐
		this.instancedPool?.dispose?.();
		this.instancedPool = new InstancedPool(this.scene, {
			maxInstances: this.size * this.size + 256,
		});
		this.#registerResourcePools();

		this.meshes = [];
		this.root.clear();
		this.tileByIndex.clear();

		const gameState = useGameState();
		const { metadata } = storeToRefs(gameState);
		const meta = metadata.value;
		// 场景地皮规模变化后，同步到 UI 状态，避免顶部 DOM 仍显示旧尺寸
		gameState.setCitySize(this.size);
		gameState.setTerritory(this.size);

		for (let x = 0; x < this.size; x++) {
			const row = [];
			for (let y = 0; y < this.size; y++) {
				// 读取元数据
				const tileMeta = meta[x]?.[y] || { type: "grass", building: null };
				const tile = new Tile(x, y, {
					type: tileMeta.type,
					building: tileMeta.building,
					direction: tileMeta.direction !== undefined ? tileMeta.direction : 0, // 传递建筑朝向
					level: tileMeta.level !== undefined ? tileMeta.level : 0, // 传递建筑等级
					renderMode: "instanced",
					city: this,
					useInstancedBuildings: this.enableInstancedBuildings || this.enableInstancedRoad || this.enableInstancedPark || this.enableInstancedHouse || this.enableInstancedCommercial || this.enableInstancedIndustrial || this.enableInstancedInfrastructure || this.enableInstancedPublicService,
				});
				row.push(tile);
				// 地皮走实例化时，Tile 仅作为逻辑数据对象，不加入场景树
				// 这样 Scene Graph 中不会出现大量 Tile-* 节点
				this.tileByIndex.set(this.getTileIndex(x, y), tile);
			}
			// 随后让 group 居中
			this.meshes.push(row);
		}
		// === 新增：重建后刷新所有道路表现 ===
		for (let x = 0; x < this.size; x++) {
			for (let y = 0; y < this.size; y++) {
				const tile = this.meshes[x][y];
				if (tile.buildingInstance && tile.buildingInstance.type === "road") {
					tile.buildingInstance.refreshView(this);
				}
			}
		}
	}

	// 调试面板，批量调色
	debugInit() {
		this.debugFolder = this.debug.ui.addFolder({
			title: "城市地皮管理",
			expanded: true,
		});
		this.debugFolder
			.addBinding(this.params, "color", {
				view: "color",
				label: "地皮颜色",
			})
			.on("change", (ev) => {
				this.setAllTileColor(ev.value);
			});
		// 新增：地皮规模调控
		this.debugFolder
			.addBinding(this, "size", {
				label: "地皮规模",
				min: 5,
				max: 65,
				step: 2,
			})
			.on("change", (_ev) => {
				// 变更规模时，重建地皮
				this.initTiles();
			});
		const statsFolder = this.debugFolder.addFolder({
			title: "实例化统计",
			expanded: false,
		});
		statsFolder.addBinding(this.params, "poolCount", { label: "池数量", readonly: true });
		statsFolder.addBinding(this.params, "poolCapacity", { label: "总容量", readonly: true });
		statsFolder.addBinding(this.params, "poolUsed", { label: "已使用", readonly: true });
		statsFolder.addBinding(this.params, "matrixUpdates", { label: "矩阵更新", readonly: true });
		statsFolder.addBinding(this.params, "hoverTileIndex", { label: "悬停索引", readonly: true });
	}

	// 批量设置所有 tile 颜色
	setAllTileColor(color) {
		for (const row of this.meshes) {
			for (const tile of row) {
				this.setTileState(tile, {
					color,
				});
			}
		}
	}

	// 更新方法（如有动态行为可扩展）
	update() {
		this.params.poolCount = this.instancedPool.stats.totalPools;
		this.params.poolCapacity = this.instancedPool.stats.totalCapacity;
		this.params.poolUsed = this.instancedPool.stats.usedInstances;
		this.params.matrixUpdates = this.instancedPool.stats.matrixUpdates;
		this.params.hoverTileIndex = this.hoverTileIndex;
		// 遍历所有地皮，执行各自的 update
		for (const row of this.meshes) {
			for (const tile of row) {
				tile.update();
			}
		}
	}

	getTile(x, y) {
		return this.meshes[x]?.[y];
	}

	getTileIndex(x, y) {
		return x * this.size + y;
	}

	getTileByIndex(index) {
		return this.tileByIndex.get(index) || null;
	}

	// 将 tile 数据映射到世界坐标（与原网格居中规则一致）
	getTileWorldPosition(x, y, out = new THREE.Vector3()) {
		const half = (this.size - 1) / 2;
		out.set(x - half, 0, y - half);
		return out;
	}

	// 统一 tile 表面资源映射
	getTileResourceName(tileType) {
		// 当前验证阶段：所有地皮（grass/ground）统一走 grassBox
		// 这样场景中只保留一个地皮实例池
		return "grassBox";
	}

	// 初始化仅注册地皮（草地）；建筑 glTF 与水泥底板在首次建造时懒注册（见 #ensureBuildingResourcePool / #ensureRoadGroundBoxPool）
	#registerResourcePools() {
		this.instancedPool.registerPrimitive(
			"grassBox",
			{
				geometry: new THREE.BoxGeometry(0.98, 0.2, 0.98),
				material: new THREE.MeshStandardMaterial({
					color: "#579649",
					metalness: 0.1,
					roughness: 0.9,
				}),
			},
			this.size * this.size + 128,
		);
	}

	/** 首次需要绘制某建筑资源时，按 resourceName 注册对应 InstancedMesh 池 */
	#ensureBuildingResourcePool(resourceName, { meshFilter } = {}) {
		if (this.instancedPool.pools.has(resourceName)) {
			return;
		}
		// 允许使用 wind_power_level1__base / __fan 这类虚拟池名，实际复用原始资源
		const sourceResourceName = resourceName.includes("__")
			? resourceName.split("__")[0]
			: resourceName;
		const resource = this.resources.items[sourceResourceName];
		if (resource?.scene) {
			this.instancedPool.registerFromResource(resourceName, resource, this.size * this.size + 128, { meshFilter });
		}
	}

	/** 建筑配套水泥底板池（与 allocateBuildingInstance 成对分配） */
	#ensureRoadGroundBoxPool() {
		if (this.instancedPool.pools.has("roadGroundBox")) {
			return;
		}
		this.instancedPool.registerPrimitive(
			"roadGroundBox",
			{
				geometry: new THREE.BoxGeometry(0.98, 0.01, 0.98),
				material: new THREE.MeshStandardMaterial({
					color: "#8b8f97",
					metalness: 0.15,
					roughness: 0.85,
				}),
			},
			this.size * this.size + 128,
		);
		if (ROAD_INSTANCE_DEBUG) {
		}
	}

	// 判断某建筑类型是否应走实例化渲染
	shouldUseInstancedBuilding(type) {
		if (this.enableInstancedBuildings) {
			return true;
		}
		if (this.enableInstancedRoad && type === "road") {
			return true;
		}
		if (this.enableInstancedPark && type === "park") {
			return true;
		}
		// 住宅类型放开实例化，实例池在首次建造时由 allocateBuildingInstance 懒注册
		if (this.enableInstancedHouse && (type === "house" || type === "house2")) {
			return true;
		}
		// 商业建筑放开实例化：商店与办公室均按需懒注册
		if (this.enableInstancedCommercial && (type === "shop" || type === "office")) {
			return true;
		}
		// 工业建筑放开实例化：工厂、化学工厂、核电站均按需懒注册
		if (this.enableInstancedIndustrial && (
			type === "factory"
			|| type === "chemistry_factory"
			|| type === "nuke_factory"
		)) {
			return true;
		}
		// 基础设施放开实例化：垃圾站、太阳能、水塔、风力发电塔均按需懒注册
		if (this.enableInstancedInfrastructure && (
			type === "garbage_station"
			|| type === "sun_power"
			|| type === "water_tower"
			|| type === "wind_power"
		)) {
			return true;
		}
		// 公共服务建筑放开实例化：英雄纪念碑、医院、警察局、消防站均按需懒注册
		return this.enableInstancedPublicService && (
			type === "hero_park"
			|| type === "hospital"
			|| type === "police"
			|| type === "fire_station"
		);
	}

	// 分配 tile 对应的地面实例
	allocateTileSurface(tile) {
		const worldPos = this.getTileWorldPosition(tile.x, tile.y);
		const resourceName = this.getTileResourceName(tile.type);
		const initialColor = resourceName === "grassBox"
			? this.getGrassInstanceColor(tile.x, tile.y)
			: undefined;
		const handle = this.instancedPool.allocate(resourceName, {
			position: worldPos,
			scale: new THREE.Vector3(0.98, 1, 0.98),
			opacity: SIMOBJECT_DEFAULT_OPACITY,
			color: initialColor,
		});
		tile.surfaceHandle = handle;
		tile.surfaceResourceName = resourceName;
		return handle;
	}

	// 生成每个地皮实例的随机绿色色偏（使用坐标哈希，保证稳定）
	getGrassInstanceColor(x, y) {
		const seed = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233) * 43758.5453;
		const t = seed - Math.floor(seed); // 0~1
		const light = THREE.MathUtils.lerp(0.30, 0.52, t);
		const saturation = THREE.MathUtils.lerp(0.36, 0.50, 1 - t);
		const color = new THREE.Color();
		color.setHSL(0.29, saturation, light);
		return color;
	}

	// 更新 tile 的地面显示状态（类型切换或高亮变化）
	setTileState(tile, { type = tile.type, color, opacity, emissive, offsetY = 0 } = {}) {
		const nextResourceName = this.getTileResourceName(type);
		if (!tile.surfaceHandle || tile.surfaceResourceName !== nextResourceName) {
			if (tile.surfaceHandle) {
				this.instancedPool.free(tile.surfaceHandle);
			}
			tile.type = type;
			this.allocateTileSurface(tile);
		}
		const worldPos = this.getTileWorldPosition(tile.x, tile.y, new THREE.Vector3());
		worldPos.y = offsetY;
		this.instancedPool.updateTransform(tile.surfaceHandle, { position: worldPos });
		if (color !== undefined) {
			this.instancedPool.updateColor(tile.surfaceHandle, color);
		}
		if (opacity !== undefined) {
			this.instancedPool.updateOpacity(tile.surfaceHandle, opacity);
		}
		if (emissive !== undefined) {
			this.instancedPool.updateEmissive(tile.surfaceHandle, emissive);
		}
	}

	// 实例化建筑分配（建筑池与水泥地均为懒加载）
	// withGround=true 时与水泥底板成对分配；用于绝大多数建筑
	allocateBuildingInstance(tile, resourceName, { scale = new THREE.Vector3(0.8, 0.8, 0.8), quaternion, y = 0.01, withGround = true } = {}) {
		this.#ensureBuildingResourcePool(resourceName);
		const worldPos = this.getTileWorldPosition(tile.x, tile.y, new THREE.Vector3());
		worldPos.y = y;
		const handle = this.instancedPool.allocate(resourceName, {
			position: worldPos,
			scale,
			quaternion,
			opacity: SIMOBJECT_DEFAULT_OPACITY,
		});
		// 所有可建造实例（道路、公园等）与薄水泥底板成对出现，拆除时一并释放
		if (handle && withGround) {
			this.#ensureRoadGroundBoxPool();
			const groundWorldPos = this.getTileWorldPosition(tile.x, tile.y, new THREE.Vector3());
			groundWorldPos.y = 0.101;
			const groundHandle = this.instancedPool.allocate("roadGroundBox", {
				position: groundWorldPos,
				scale: new THREE.Vector3(0.98, 1, 0.98),
				opacity: SIMOBJECT_DEFAULT_OPACITY,
			});
			handle.groundHandle = groundHandle;
		}
		return handle;
	}

	/** 风机实例化：拆分塔身与扇叶资源池（扇叶可单独旋转） */
	allocateWindPowerInstance(tile, modelName, { scale = new THREE.Vector3(0.8, 0.8, 0.8), quaternion, y = 0.11 } = {}) {
		const baseResourceName = `${modelName}__base`;
		const fanResourceName = `${modelName}__fan`;
		// 按名称关键字拆分：兼容 fan/Fan/fan_blade 等命名
		this.#ensureBuildingResourcePool(baseResourceName, {
			meshFilter: (child) => {
				const name = String(child.name || "").toLowerCase();
				return !name.includes("fan");
			},
		});
		this.#ensureBuildingResourcePool(fanResourceName, {
			meshFilter: (child) => {
				const name = String(child.name || "").toLowerCase();
				return name.includes("fan");
			},
		});
		// 塔身负责地面配套，扇叶只做旋转层，不重复分配水泥底板
		const baseHandle = this.allocateBuildingInstance(tile, baseResourceName, {
			scale,
			quaternion,
			y,
			withGround: true,
		});
		const baseWorldPos = this.getTileWorldPosition(tile.x, tile.y, new THREE.Vector3());
		baseWorldPos.y = y;
		const fanHandle = this.instancedPool.allocate(fanResourceName, {
			// fan 几何已在 registerFromResource 中烘焙了局部变换，这里无需再叠加轮毂偏移
			position: baseWorldPos,
			scale,
			quaternion: quaternion || new THREE.Quaternion(),
			opacity: SIMOBJECT_DEFAULT_OPACITY,
		});
		if (baseHandle) {
			baseHandle.fanHandle = fanHandle || null;
		}
		return { baseHandle, fanHandle };
	}

	// 释放建筑实例
	freeBuildingInstance(handle) {
		// 风机拆分实例时，base handle 上会附带 fanHandle，释放时需一并回收
		if (handle?.fanHandle) {
			this.instancedPool.free(handle.fanHandle);
		}
		if (handle?.groundHandle) {
			this.instancedPool.free(handle.groundHandle);
		}
		this.instancedPool.free(handle);
	}

	// 更新建筑实例（例如道路换型）
	replaceBuildingInstance(tile, oldHandle, nextResourceName, { quaternion, scale = new THREE.Vector3(0.8, 0.8, 0.8), y = 0.01 } = {}) {
		let retainedGroundHandle = null;
		if (oldHandle) {
			// 道路换型时保留原地块的水泥地板实例，避免反复销毁重建
			retainedGroundHandle = oldHandle.groundHandle || null;
			this.instancedPool.free(oldHandle);
		}
		const nextHandle = this.allocateBuildingInstance(tile, nextResourceName, { quaternion, scale, y });
		if (nextHandle && retainedGroundHandle) {
			// 复用地板句柄，并释放新分配的重复地板实例
			if (nextHandle.groundHandle) {
				this.instancedPool.free(nextHandle.groundHandle);
			}
			nextHandle.groundHandle = retainedGroundHandle;
		}
		return nextHandle;
	}

	// 实例级高亮颜色映射
	getHighlightVisual(mode = "select") {
		switch (mode) {
			case "build":
				return { color: BUILD_COLOR, opacity: BUILD_COLOR_OPACITY };
			case "build-invalid":
				return { color: BUILD_INVALID_COLOR, opacity: BUILD_INVALID_COLOR_OPACITY };
			case "relocate":
				return { color: RELOCATE_COLOR, opacity: RELOCATE_COLOR_OPACITY };
			case "demolish":
				return { color: DEMOLISH_COLOR, opacity: DEMOLISH_COLOR_OPACITY };
			case "select":
			default:
				return { color: SELECTED_COLOR, opacity: SELECTED_COLOR_OPACITY };
		}
	}

	// 应用 tile 高亮（用于 hover/selected）
	applyTileHighlight(tile, isActive, mode = "select") {
		if (!tile?.surfaceHandle) {
			return;
		}
		if (!isActive) {
			this.setTileState(tile, {
				type: tile.type,
				color: this.params.color,
				opacity: SIMOBJECT_DEFAULT_OPACITY,
				emissive: 0x000000,
				offsetY: 0,
			});
			return;
		}
		const visual = this.getHighlightVisual(mode);
		this.setTileState(tile, {
			type: tile.type,
			color: visual.color,
			opacity: visual.opacity,
			emissive: visual.color,
			offsetY: 0.08,
		});
	}

	// resize方法（如有需要可扩展）
	resize() {
		// 预留
	}
}
