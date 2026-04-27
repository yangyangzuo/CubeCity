import { BUILDING_DATA } from '@/constants/constants.js'
import * as THREE from 'three'
import Experience from '../../experience.js'
import { checkStatusCondition, getBuildingStatusEffects } from '../../utils/building-interaction-utils.js'
import { BuffEffects } from '../effects.js'
import SimObject from './sim-object.js'

const ROAD_INSTANCE_DEBUG = true

// 状态分类配置
const STATUS_CATEGORIES = {
  // debuff 状态（问题状态，优先显示）
  DEBUFF: ['MISSING_ROAD', 'MISSING_POWER', 'MISSING_POPULATION', 'OVER_POPULATION', 'MISSING_POLLUTION', 'SAD', 'EFFICIENCY_BOOST'],
  // buff 状态（增益状态）
  BUFF: ['POWER_BOOST', 'ECONOMY_BOOST', 'POPULATION_BOOST', 'COIN_BUFF', 'HUMAN_BUFF', 'UPGRADE'],
}

// 轮循配置
const ROTATION_CONFIG = {
  interval: 2500, // 2.5秒切换一次
  debuffPriority: true, // debuff优先显示
  fadeTransition: 300, // 切换动画时长(ms)
}

// 建筑物基类，所有具体建筑继承自此类
export default class Building extends SimObject {
  /**
   * @param {string} type 建筑类型
   * @param {number} level 建筑等级
   * @param {number} direction 朝向（0/1/2/3，单位90度）
   * @param {object} [options] 其他可选参数
   */
  constructor(type, level = 1, direction = 0, options = {}) {
    // 位置和资源由外部设置，建筑一般位于tile中心
    super(0, 0, null)
    this.experience = new Experience()
    this.resources = this.experience.resources
    this.type = type
    this.level = level
    this.direction = direction
    this.options = options
    this.levelData = options.levelData || null
    this.city = options.city || null
    this.tile = options.tile || null
    this.useInstancedBuilding = Boolean(options.useInstancedBuilding)
    this.instanceHandle = null
    this.resourceName = null
    this.effectMesh = null
    this.effectAnchorReleaseTimer = null
    this.effectBaseHeight = null

    // 新的轮循状态系统
    this.statusConfig = [] // 由子类定义所有可能的状态及其效果
    this.activeBuffs = [] // 当前激活的buff状态
    this.activeDebuffs = [] // 当前激活的debuff状态
    this.currentDisplayArray = [] // 当前轮循显示的状态数组
    this.rotationIndex = 0 // 当前轮循索引
    this.rotationTimer = null // 轮循定时器
    this.currentStatusInstance = null // 当前显示的状态实例
    this.isTransitioning = false // 是否正在切换中

    this.initModel()
  }

  // 初始化建筑模型
  initModel() {
    // 道路资源命名与常规建筑不同，实例化时统一使用 road
    const modelName = this.type === 'road' ? 'road' : `${this.type}_level${this.level}`
    const modelResource = this.resources.items[modelName]
    this.resourceName = modelName

    // 实例化渲染路径：不再生成独立 mesh，直接分配实例句柄
    if (this.useInstancedBuilding && this.city && this.tile) {
      const angle = (this.direction % 4) * 90
      const quaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(angle))
      // 与水泥底板（y≈0.101）对齐，避免陷入草地盒或埋进薄板
      const instanceY = 0.11
      this.instanceHandle = this.city.allocateBuildingInstance(this.tile, modelName, {
        quaternion,
        scale: new THREE.Vector3(0.8, 0.8, 0.8),
        y: instanceY,
      })
      return
    }

    if (modelResource && modelResource.scene) {
      const mesh = this.initMeshFromResource(modelResource)
      mesh.position.set(0, 0, 0)
      mesh.scale.set(0.8, 0.8, 0.8)
      // 设置朝向
      const angle = (this.direction % 4) * 90
      mesh.rotation.y = THREE.MathUtils.degToRad(angle)
      // 禁止建筑被选中
      mesh.raycast = () => {}
      this.setMesh(mesh)
    }
    else {
      // 没有资源时，使用占位体
      const geometry = new THREE.BoxGeometry(0.8, 0.8, 0.8)
      const material = new THREE.MeshStandardMaterial({ color: '#bdae93' })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.position.set(0, 0.4, 0)
      this.setMesh(mesh)
    }
  }

  // 实例化渲染下释放句柄
  dispose() {
    if (this.effectAnchorReleaseTimer) {
      clearTimeout(this.effectAnchorReleaseTimer)
      this.effectAnchorReleaseTimer = null
    }
    if (this.effectMesh?.parent) {
      this.effectMesh.parent.remove(this.effectMesh)
    }
    this.effectMesh = null
    if (this.useInstancedBuilding && this.city && this.instanceHandle) {
      this.city.freeBuildingInstance(this.instanceHandle)
      this.instanceHandle = null
    }
    super.dispose()
  }

  // 实例化渲染下将高亮写入实例属性
  setFocused(value, mode = 'select') {
    if (this.useInstancedBuilding && this.instanceHandle && this.city) {
      const visual = this.city.getHighlightVisual(mode)
      if (value) {
        this.city.instancedPool.updateColor(this.instanceHandle, visual.color)
        this.city.instancedPool.updateOpacity(this.instanceHandle, visual.opacity)
        this.city.instancedPool.updateEmissive(this.instanceHandle, visual.color)
      }
      else {
        this.city.instancedPool.updateOpacity(this.instanceHandle, 1.0)
        this.city.instancedPool.updateEmissive(this.instanceHandle, 0x000000)
        this.city.instancedPool.updateColor(this.instanceHandle, 0xffffff)
      }
      return
    }
    super.setFocused(value, mode)
  }

  // 可被子类重写：升级、产出等
  update() {
    // 如果没有状态配置，则什么也不做
    if (!this.statusConfig || this.statusConfig.length === 0) {
      return
    }

    const gameState = this.experience.gameState

    // 检查升级状态
    const upgradeStatus = this.statusConfig.find(s => s.statusType === 'UPGRADE')
    const isUpgradeActive = upgradeStatus
      && upgradeStatus.condition(this, gameState)
      && gameState.currentMode === 'select'

    const newActiveBuffs = []
    const newActiveDebuffs = []

    if (isUpgradeActive) {
      // 如果升级状态激活，则只处理升级
      newActiveBuffs.push(upgradeStatus)
    }
    else {
      // 否则，处理所有其他状态
      for (const status of this.statusConfig) {
        // 如果升级状态的条件满足，但不处于'select'模式，则不显示它
        if (status.statusType === 'UPGRADE') {
          continue
        }

        if (status.condition(this, gameState)) {
          if (this.isDebuffStatus(status.statusType)) {
            newActiveDebuffs.push(status)
          }
          else {
            newActiveBuffs.push(status)
          }
        }
      }
    }

    // 检查状态是否发生变化
    const buffsChanged = this.hasStatusArrayChanged(this.activeBuffs, newActiveBuffs)
    const debuffsChanged = this.hasStatusArrayChanged(this.activeDebuffs, newActiveDebuffs)

    if (buffsChanged || debuffsChanged) {
      // 更新状态数组
      this.activeBuffs = newActiveBuffs
      this.activeDebuffs = newActiveDebuffs

      // 重新启动轮循显示
      this.restartStatusRotation()
    }
    this.updateActiveEffect()
  }

  /**
   * 判断是否为debuff状态
   * @param {string} statusType - 状态类型
   * @returns {boolean}
   */
  isDebuffStatus(statusType) {
    return STATUS_CATEGORIES.DEBUFF.includes(statusType)
  }

  /**
   * 检查状态数组是否发生变化
   * @param {Array} oldArray - 旧状态数组
   * @param {Array} newArray - 新状态数组
   * @returns {boolean}
   */
  hasStatusArrayChanged(oldArray, newArray) {
    if (oldArray.length !== newArray.length)
      return true

    const oldTypes = oldArray.map(s => s.statusType).sort()
    const newTypes = newArray.map(s => s.statusType).sort()

    return !oldTypes.every((type, index) => type === newTypes[index])
  }

  /**
   * 重新启动状态轮循显示
   */
  restartStatusRotation() {
    // 停止当前轮循
    this.stopStatusRotation()

    // 根据优先级选择要显示的状态数组
    this.currentDisplayArray = ROTATION_CONFIG.debuffPriority && this.activeDebuffs.length > 0
      ? this.activeDebuffs
      : this.activeBuffs

    // 如果没有状态需要显示，清理当前效果
    if (this.currentDisplayArray.length === 0) {
      this.deactivateCurrentStatus()
      return
    }

    // 重置轮循索引
    this.rotationIndex = 0

    // 如果只有一个状态，直接显示
    if (this.currentDisplayArray.length === 1) {
      this.displayStatusAtIndex(0)
    }
    else {
      // 多个状态，启动轮循
      this.displayStatusAtIndex(0)
      this.startRotationTimer()
    }
  }

  /**
   * 启动轮循定时器
   */
  startRotationTimer() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer)
    }

    this.rotationTimer = setInterval(() => {
      if (!this.isTransitioning && this.currentDisplayArray.length > 1) {
        this.rotationIndex = (this.rotationIndex + 1) % this.currentDisplayArray.length
        this.displayStatusAtIndex(this.rotationIndex)
      }
    }, ROTATION_CONFIG.interval)
  }

  /**
   * 停止状态轮循
   */
  stopStatusRotation() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer)
      this.rotationTimer = null
    }
  }

  /**
   * 显示指定索引的状态
   * @param {number} index - 状态索引
   */
  displayStatusAtIndex(index) {
    if (index >= this.currentDisplayArray.length || this.isTransitioning)
      return

    const targetStatus = this.currentDisplayArray[index]

    // 如果当前已经显示相同状态，跳过
    if (this.currentStatusInstance
      && this.currentStatusInstance.statusType === targetStatus.statusType) {
      return
    }

    // 设置过渡状态
    this.isTransitioning = true

    // 如果有当前状态，先执行淡出
    if (this.currentStatusInstance) {
      this.fadeOutCurrentStatus(() => {
        this.activateNewStatus(targetStatus)
      })
    }
    else {
      this.activateNewStatus(targetStatus)
    }
  }

  /**
   * 淡出当前状态
   * @param {Function} onComplete - 淡出完成回调
   */
  fadeOutCurrentStatus(onComplete) {
    if (!this.currentStatusInstance) {
      onComplete()
      return
    }

    const handler = BuffEffects[this.currentStatusInstance.effect.type]
    const effectTarget = this.getEffectTargetMesh()
    if (handler && handler.fadeOut) {
      // 使用专门的淡出方法
      handler.fadeOut(effectTarget, this.currentStatusInstance.instance, () => {
        this.currentStatusInstance = null
        onComplete()
      })
    }
    else {
      // 使用标准的deactivate方法
      this.deactivateCurrentStatus()
      onComplete()
    }
  }

  /**
   * 激活新状态
   * @param {object} status - 状态配置
   */
  activateNewStatus(status) {
    const handler = BuffEffects[status.effect.type]
    const effectConfig = {
      ...status.effect,
      // 实例化路径下将“模型包围盒顶部高度”透传给 billboard，保持与旧 mesh 路径一致的垂直基准
      baseHeight: this.getEffectBaseHeight(),
    }
    // 实例化路径：仅在需要显示状态图标时才创建锚点，避免常驻 Object3D
    if (!this.mesh && this.useInstancedBuilding) {
      this.createInstancedEffectAnchor(0.11)
    }
    const effectTarget = this.getEffectTargetMesh()
    if (handler) {
      const instance = handler.activate(effectTarget, effectConfig, this.experience)
      this.currentStatusInstance = {
        statusType: status.statusType,
        effect: effectConfig,
        instance,
      }
    }

    // 重置过渡状态
    this.isTransitioning = false
  }

  /**
   * 停用当前状态
   */
  deactivateCurrentStatus() {
    if (!this.currentStatusInstance)
      return

    const handler = BuffEffects[this.currentStatusInstance.effect.type]
    const effectTarget = this.getEffectTargetMesh()
    if (handler) {
      handler.deactivate(effectTarget, this.currentStatusInstance.instance, this.experience)
    }
    this.currentStatusInstance = null
    this.scheduleReleaseInstancedEffectAnchor()
  }

  /**
   * 更新需要持续调用的效果（如Shader）
   */
  updateActiveEffect() {
    if (!this.currentStatusInstance)
      return

    const handler = BuffEffects[this.currentStatusInstance.effect.type]
    const effectTarget = this.getEffectTargetMesh()
    // 检查处理器是否有 update 方法
    if (handler && handler.update && effectTarget) {
      handler.update(effectTarget, this.currentStatusInstance.instance)
    }
  }

  /**
   * 清理所有残留的广告牌效果和轮循系统
   */
  cleanupBillboards() {
    // 停止轮循
    this.stopStatusRotation()

    // 停用当前状态
    this.deactivateCurrentStatus()

    const effectTarget = this.getEffectTargetMesh()
    if (!effectTarget)
      return

    // 立即清理所有广告牌相关的子对象
    effectTarget.children.forEach((child) => {
      if (child.name && child.name.startsWith('buff_billboard_')) {
        // 立即停止任何正在进行的动画
        if (child.userData.timeline) {
          child.userData.timeline.kill()
        }
        effectTarget.remove(child)
        if (child.geometry)
          child.geometry.dispose()
        if (child.material)
          child.material.dispose()
        delete child.userData.timeline
      }
    })

    // 重置状态
    this.activeBuffs = []
    this.activeDebuffs = []
    this.currentDisplayArray = []
    this.rotationIndex = 0
    this.isTransitioning = false
    this.scheduleReleaseInstancedEffectAnchor(true)
  }

  /** 获取状态图标挂载目标：优先真实 mesh，其次实例化路径锚点 */
  getEffectTargetMesh() {
    return this.mesh || this.effectMesh
  }

  /** 实例化建筑创建状态锚点（Object3D，不参与渲染） */
  createInstancedEffectAnchor(instanceY = 0.11) {
    if (!this.city || !this.tile || this.effectMesh) {
      return
    }
    const anchorMesh = new THREE.Object3D()
    const worldPos = this.city.getTileWorldPosition(this.tile.x, this.tile.y, new THREE.Vector3())
    worldPos.y = instanceY
    anchorMesh.position.copy(worldPos)
    anchorMesh.name = `EffectAnchor-${this.type}-${this.tile.x}-${this.tile.y}`
    this.experience.scene.add(anchorMesh)
    this.effectMesh = anchorMesh
  }

  /** 状态结束后回收实例化锚点，避免 Scene 中堆积 EffectAnchor-* 对象 */
  scheduleReleaseInstancedEffectAnchor(immediate = false) {
    if (this.mesh || !this.effectMesh) {
      return
    }
    if (this.effectAnchorReleaseTimer) {
      clearTimeout(this.effectAnchorReleaseTimer)
      this.effectAnchorReleaseTimer = null
    }
    const release = () => {
      // 仍有状态在展示则不释放
      if (this.currentStatusInstance || this.currentDisplayArray.length > 0) {
        return
      }
      if (this.effectMesh?.parent) {
        this.effectMesh.parent.remove(this.effectMesh)
      }
      this.effectMesh = null
      this.effectAnchorReleaseTimer = null
    }
    if (immediate) {
      release()
      return
    }
    // 给淡出动画留一点时间，避免中途移除锚点导致状态切换闪烁
    this.effectAnchorReleaseTimer = setTimeout(release, 360)
  }

  /**
   * 组件销毁时的清理
   */
  destroy() {
    this.cleanupBillboards()
    // 调用父类销毁方法（如果有的话）
    if (super.destroy) {
      super.destroy()
    }
  }

  /**
   * 检查周围是否有符合增益条件的目标建筑
   * @param {object} gameState - Pinia 的 gameState 实例
   * @returns {boolean} - 是否找到了目标
   */
  checkForBuffTargets(gameState) {
    if (!gameState)
      return false

    const { x, y } = this.getGridPosition()
    // 从 buffConfig 中获取检查范围，默认为1（相邻）
    const range = this.buffConfig.range || 1

    // 在指定范围内检查所有位置（使用切比雪夫距离，形成正方形范围）
    for (let dx = -range; dx <= range; dx++) {
      for (let dy = -range; dy <= range; dy++) {
        // 跳过自己的位置
        if (dx === 0 && dy === 0)
          continue

        // 实例化路径下 Building 不挂在 Tile 树上，需优先使用 tile 坐标
        const neighborTile = gameState.getTile(x + dx, y + dy)

        // 检查邻居是否存在，以及其建筑类型是否在我们的目标列表里
        if (neighborTile && this.buffConfig.targets.includes(neighborTile.building)) {
          return true // 只要找到一个目标，就应该激活
        }
      }
    }
    return false // 没有找到任何目标
  }

  /**
   * 通用升级方法：根据 BUILDING_DATA 结构查找下一级 level
   * @returns {object|null} 下一级 {type, level, direction}，或 null（不可升级/已最高级）
   */
  upgrade() {
    const buildingData = BUILDING_DATA[this.type]
    if (!buildingData || !buildingData.levels)
      return null
    const nextLevel = this.level + 1
    const nextLevelData = buildingData.levels[nextLevel]
    if (!nextLevelData)
      return null // 已是最高级
    return {
      type: this.type,
      level: nextLevel,
      direction: this.direction,
    }
  }

  /**
   * 获取建筑升级所需资源
   * @returns {number} 升级所需资源
   */
  getCost() {
    return BUILDING_DATA[this.type].levels[this.level].cost
  }

  getPopulation() { return 0 }
  getPower() { return 0 }
  getEconomy() { return 0 }

  // 可重写：返回建筑信息
  toHTML() {
    const dirMap = ['右', '下', '左', '上']
    const dirText = dirMap[this.direction % 4] || this.direction
    return `
      <div class="info-heading text-lg font-bold mb-2 text-green-700">建筑信息</div>
      <div class="flex flex-col gap-1">
        <div><span class="info-label text-gray-500">类型：</span><span class="info-value text-gray-800">${this.type}</span></div>
        <div><span class="info-label text-gray-500">朝向：</span><span class="info-value text-gray-800">${dirText}</span></div>
      </div>
    `
  }

  /**
   * 获取默认状态配置（结合配置文件和基础检查）
   * @returns {Array} 状态配置数组
   */
  getDefaultStatusConfig() {
    const baseConfig = [
      // 缺少道路连接（保留基础检查）
      {
        statusType: 'MISSING_ROAD',
        condition: (building, gs) => {
          building.buffConfig = { targets: ['road'] }
          return !building.checkForBuffTargets(gs)
        },
        // 缺路图标高度使用包围盒自适应间距（在 effects.js 内按 baseHeight 计算）
        effect: { type: 'missRoad', scale: 0.65, topPaddingRatio: 0.08, minTopPadding: 0.12 },
      },
    ]

    // 从配置文件加载建筑专属的状态效果
    const buildingStatusEffects = getBuildingStatusEffects(this.type)

    // 将配置文件中的状态效果转换为Building类可以理解的格式
    const configuredEffects = buildingStatusEffects.map(statusConfig => ({
      statusType: statusConfig.type,
      condition: (building, gs) => {
        const { x, y } = building.getGridPosition()
        return checkStatusCondition(gs, building.type, x, y, statusConfig)
      },
      effect: statusConfig.effect,
    }))

    // 合并基础配置和配置文件中的效果
    return [...baseConfig, ...configuredEffects]
  }

  /** 获取建筑所在格子坐标：实例化路径优先取 tile 坐标，mesh 路径回退到 world 坐标 */
  getGridPosition() {
    if (this.tile) {
      return { x: this.tile.x, y: this.tile.y }
    }
    return { x: this.x, y: this.y }
  }

  /** 计算状态图标的基础高度：优先用资源包围盒（实例化路径），回退 0 */
  getEffectBaseHeight() {
    if (this.effectBaseHeight !== null) {
      return this.effectBaseHeight
    }
    if (!this.resourceName || !this.resources?.items) {
      this.effectBaseHeight = 0
      return this.effectBaseHeight
    }
    // wind_power 拆分为 __base/__fan 时，图标高度应基于原模型
    const baseResourceName = this.resourceName.replace('__base', '').replace('__fan', '')
    const resource = this.resources.items[baseResourceName]
    if (!resource?.scene) {
      this.effectBaseHeight = 0
      return this.effectBaseHeight
    }
    const box = new THREE.Box3().setFromObject(resource.scene)
    const modelTopY = box.isEmpty() ? 0 : box.max.y
    // 建筑实例统一 scale=0.8，按同倍率缩放高度
    this.effectBaseHeight = modelTopY * 0.8
    return this.effectBaseHeight
  }
}
