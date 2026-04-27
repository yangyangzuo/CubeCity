import Building from '../building.js'
import * as THREE from 'three'

export default class WindPower extends Building {
  constructor(type = 'wind_power', level = 1, direction = 0, options = {}) {
    super(type, level, direction, options)

    // 注意：super() 内已触发 initModel；这里不能覆盖 initModel 里写入的句柄/状态
    this.fanRotationSpeed ??= 0.01 + Math.random() * 0.02
    // 扇叶实例句柄（实例化路径专用）
    this.fanHandle ??= null
    // 扇叶绕 X 轴累积角度，逐帧推进
    this.fanRotationX ??= 0
    // 扇叶旋转轴（会根据模型包围盒自动推断）
    this.fanAxis ??= new THREE.Vector3(1, 0, 0)
    // 扇叶枢轴相对模型原点偏移（用于旋转中心补偿）
    this.fanPivotOffset ??= new THREE.Vector3(0, 0, 0)
    // 缓存实例参数，避免每帧临时创建对象
    this.instanceScale ??= new THREE.Vector3(0.8, 0.8, 0.8)
    this.instanceY ??= 0.11
    this.baseWorldPos ??= new THREE.Vector3()

    // 使用新的配置系统，大部分状态效果已在配置文件中定义
    this.statusConfig = [
      // 继承基础的状态配置（包括道路检查和配置文件中的所有效果）

      {
        statusType: 'POWER_BOOST',
        condition: (building, gs) => {
          // 太阳能发电站正常运行时激活
          return gs.power >= 0
        },
        effect: { type: 'powerup', offsetY: 0.6 },
      },
    ]
  }

  getCost() {
    return this.options.buildingData?.cost || 0
  }

  // 风力发电提供清洁电力
  getPower() {
    return 30
  }

  // 风机实例化路径：拆分塔身与扇叶实例，支持扇叶旋转
  initModel() {
    // 注意：Building 构造函数内会先调用 initModel()，此时子类构造赋值尚未执行
    // 因此这里要做一次兜底初始化，避免 resolveFanAxis 中访问未定义字段
    if (!this.fanAxis) {
      this.fanAxis = new THREE.Vector3(1, 0, 0)
    }
    if (this.fanRotationX === undefined) {
      this.fanRotationX = 0
    }
    if (this.fanRotationSpeed === undefined) {
      this.fanRotationSpeed = 0.02
    }
    if (!this.fanPivotOffset) {
      this.fanPivotOffset = new THREE.Vector3(0, 0, 0)
    }
    if (!this.instanceScale) {
      this.instanceScale = new THREE.Vector3(0.8, 0.8, 0.8)
    }
    if (this.instanceY === undefined) {
      this.instanceY = 0.11
    }
    if (!this.baseWorldPos) {
      this.baseWorldPos = new THREE.Vector3()
    }

    const modelName = `${this.type}_level${this.level}`
    this.resourceName = modelName
    if (this.useInstancedBuilding && this.city && this.tile) {
      const angle = (this.direction % 4) * 90
      const baseQuaternion = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        THREE.MathUtils.degToRad(angle),
      )
      const { baseHandle, fanHandle } = this.city.allocateWindPowerInstance(this.tile, modelName, {
        quaternion: baseQuaternion,
        scale: this.instanceScale,
        y: this.instanceY,
      })
      // 若子网格筛选失败（如 fan 命名不一致）则回退整模型实例化，保证风机可见
      this.instanceHandle = baseHandle || this.city.allocateBuildingInstance(this.tile, modelName, {
        quaternion: baseQuaternion,
        scale: new THREE.Vector3(0.8, 0.8, 0.8),
        y: 0.11,
      })
      this.fanHandle = baseHandle ? fanHandle : null
      // 只有扇叶分离成功时才需要叠加基准朝向
      this.baseQuaternion = this.fanHandle ? baseQuaternion.clone() : null
      if (this.fanHandle) {
        // 需求明确：风机扇叶固定绕 X 轴旋转，不做自动轴推断
        this.fanAxis.set(1, 0, 0)
        this.resolveFanPivotOffset(modelName)
      }
      this.createInstancedEffectAnchor(0.11)
      return
    }
    super.initModel()
  }

  dispose() {
    if (this.fanHandle && this.city) {
      this.city.instancedPool.free(this.fanHandle)
      this.fanHandle = null
    }
    super.dispose()
  }

  // 重写 update 方法以调用新的轮循系统
  update() {
    // 调用父类的新轮循逻辑
    super.update()

    if (this.useInstancedBuilding && this.fanHandle && this.city) {
      // 实例化模式下：每帧仅更新扇叶实例的旋转，不触碰塔身实例矩阵
      this.fanRotationX += this.fanRotationSpeed
      const fanSpin = new THREE.Quaternion().setFromAxisAngle(this.fanAxis, this.fanRotationX)
      const finalQuaternion = this.baseQuaternion
        ? this.baseQuaternion.clone().multiply(fanSpin)
        : fanSpin
      // 绕 fan 枢轴旋转时，需要做位置补偿，避免看起来绕模型底部转
      const localPivot = this.fanPivotOffset.clone().multiply(this.instanceScale)
      const rotatedPivot = localPivot.clone().applyQuaternion(fanSpin)
      const localAdjust = localPivot.sub(rotatedPivot)
      const worldAdjust = this.baseQuaternion
        ? localAdjust.applyQuaternion(this.baseQuaternion)
        : localAdjust
      const worldPos = this.city.getTileWorldPosition(this.tile.x, this.tile.y, this.baseWorldPos)
      worldPos.y = this.instanceY
      worldPos.add(worldAdjust)
      this.city.instancedPool.updateTransform(this.fanHandle, {
        quaternion: finalQuaternion,
        position: worldPos.clone(),
      })
      return
    }

    // 实例化路径下没有独立 mesh，旧的扇叶逐帧旋转逻辑直接跳过
    if (!this.mesh) {
      return
    }
    this.mesh.traverse((child) => {
      if (child.name === 'fan') {
        child.rotation.x += this.fanRotationSpeed
      }
    })
  }

  /** 读取 fan 节点枢轴相对模型原点偏移 */
  resolveFanPivotOffset(modelName) {
    const resource = this.resources.items[modelName]
    if (!resource?.scene) {
      this.fanPivotOffset.set(0, 0, 0)
      return
    }
    let fanNode = null
    resource.scene.updateWorldMatrix(true, true)
    resource.scene.traverse((child) => {
      if (fanNode || !(child instanceof THREE.Object3D)) {
        return
      }
      const name = String(child.name || '').toLowerCase()
      if (name.includes('fan')) {
        fanNode = child
      }
    })
    if (!fanNode) {
      this.fanPivotOffset.set(0, 0, 0)
      return
    }
    this.fanPivotOffset.copy(fanNode.getWorldPosition(new THREE.Vector3()))
  }

}
