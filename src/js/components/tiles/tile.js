import { BUILDING_DATA } from '@/constants/constants.js'
import * as THREE from 'three'
import Experience from '../../experience.js'
import { createBuilding } from './building-factory.js'
import SimObject from './sim-object.js'
// 未来可引入更多建筑类型

// Tile 类，代表单个地皮格子，继承 SimObject
export default class Tile extends SimObject {
  /**
   * @param {number} x
   * @param {number} y
   * @param {object} options
   *   options.type: 'grass' | 'ground'
   *   options.building: null | 'house'
   *   options.color: 颜色字符串
   *   options.direction: 建筑朝向，0/90/180/270，单位为度，默认为0
   */
  constructor(x, y, { type = 'grass', building = null, direction = 0, level = 0, renderMode = 'mesh', city = null, useInstancedBuildings = false } = {}) {
    // 获取 Experience 单例
    const experience = new Experience()
    const resources = experience.resources
    super(x, y, null) // 父类不传 mesh，由本类自行管理
    this.experience = experience
    this.scene = experience.scene
    this.resources = resources
    this.debug = experience.debug

    this.name = `Tile-${x}-${y}`
    this.type = type // 草地/道路/住宿/商业/工业/公共设施/社会服务/政府建筑
    this.direction = direction // 建筑朝向，单位为度
    this.level = level // 建筑等级
    this.buildingInstance = null
    this.renderMode = renderMode
    this.city = city
    this.surfaceHandle = null
    this.surfaceResourceName = null
    this.useInstancedBuildings = useInstancedBuildings

    if (this.renderMode === 'mesh') {
      // ========== 旧渲染路径：草地统一改为轻量 BoxGeometry ==========
      this.grassMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.98, 0.2, 0.98),
        new THREE.MeshStandardMaterial({
          color: '#579649',
          metalness: 0.1,
          roughness: 0.9,
        }),
      )
      this.grassMesh.position.set(0, 0, 0)
      this.grassMesh.scale.set(0.98, 1, 0.98)
      this.grassMesh.userData = this
      this.grassMesh.name = `${this.name}-grass`

      // ========== 旧渲染路径：创建 ground mesh ==========
      const groundResource = resources.items.ground ? resources.items.ground : null
      this.groundMesh = groundResource
        ? this.initMeshFromResource(groundResource)
        : new THREE.Mesh(
          new THREE.BoxGeometry(1, 0.2, 1),
          new THREE.MeshStandardMaterial({ color: '#a89984' }),
        )
      this.groundMesh.position.set(0, 0.01, 0)
      this.groundMesh.scale.set(0.98, 1, 0.98)
      this.groundMesh.userData = this
      this.groundMesh.name = `${this.name}-ground`
      this.groundMesh.visible = (type === 'ground')

      this.grassMesh.add(this.groundMesh)
      this.setMesh(this.grassMesh)
    }
    else if (this.city) {
      // 实例化路径：仅分配地面实例，Tile 继续作为业务对象存在
      this.city.allocateTileSurface(this)
    }

    // 如果有建筑，加载建筑实例
    if (building) {
      this.setBuilding(building, level, direction)
    }
  }

  // 切换地皮类型（只切换 ground mesh 显隐）
  setType(type) {
    this.type = type
    if (this.renderMode === 'mesh') {
      this.groundMesh.visible = (type === 'ground')
      return
    }
    if (this.city) {
      this.city.setTileState(this, { type })
    }
  }

  // 创建并添加建筑实例
  setBuilding(type, level = 1, direction = 0) {
    this.removeBuilding()
    const buildingData = BUILDING_DATA[type]
    const levelData = buildingData.levels[level]
    const useInstancedBuilding = this.city
      ? this.city.shouldUseInstancedBuilding(type)
      : this.useInstancedBuildings
    const options = {
      buildingData,
      levelData,
      position: { x: this.x, y: this.y },
      city: this.city,
      tile: this,
      useInstancedBuilding,
    }
    const buildingInstance = createBuilding(type, level, direction, options)
    if (buildingInstance) {
      this.buildingInstance = buildingInstance
      if (this.renderMode === 'mesh') {
        this.grassMesh.add(buildingInstance)
      }
    }
  }

  // 移除原有建筑实例
  removeBuilding() {
    if (this.buildingInstance) {
      if (this.renderMode === 'mesh') {
        this.grassMesh.remove(this.buildingInstance)
      }
      this.buildingInstance.dispose?.()
      this.buildingInstance = null
    }
  }

  // 释放 Tile 持有的资源（重建地图尺寸时调用）
  dispose() {
    this.removeBuilding()
    if (this.renderMode !== 'mesh' && this.city && this.surfaceHandle) {
      this.city.instancedPool.free(this.surfaceHandle)
      this.surfaceHandle = null
      this.surfaceResourceName = null
    }
  }

  // 设置材质颜色（只作用于 grass）
  setColor(color) {
    if (this.renderMode === 'mesh' && this.grassMesh && this.grassMesh.material) {
      this.grassMesh.material.color.set(color)
    }
    else if (this.city) {
      this.city.setTileState(this, { color })
    }
  }

  update() {
    // 建筑实例存在时，调用其 update
    if (this.buildingInstance) {
      this.buildingInstance.update()
    }
    // ...
  }

  resize() {
    // 预留
  }

  // 在实例化渲染下，聚焦效果转交给 City 管理
  setFocused(value, mode = 'select') {
    if (this.renderMode === 'mesh') {
      super.setFocused(value, mode)
      return
    }
    this.city?.applyTileHighlight(this, value, mode)
    this.buildingInstance?.setFocused(value, mode)
  }
}
