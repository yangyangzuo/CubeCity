import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Experience from './experience.js'

export default class Camera {
  constructor(orthographic = false) {
    this.experience = new Experience()
    this.sizes = this.experience.sizes
    this.scene = this.experience.scene
    this.canvas = this.experience.canvas
    this.orthographic = orthographic
    this.debug = this.experience.debug
    this.debugActive = this.experience.debug.active

    /* ---------- 固定点位 ---------- */
    this.fixedPoints = [
      new THREE.Vector3(18, 18, 18),
    ]
    this.currentIndex = 0 // 当前点位索引
    this.target = new THREE.Vector3(0, 0, 0)

    this.setInstance()
    this.setControls()
    this.setDebug()
  }

  /* -------------------------------------------------- */
  /*  其余函数保持不变（setInstance / setControls ……）  */
  /* -------------------------------------------------- */

  setInstance() {
    if (this.orthographic) {
      const aspect = this.sizes.aspect
      this.frustumSize = 10
      this.instance = new THREE.OrthographicCamera(
        -this.frustumSize * aspect,
        this.frustumSize * aspect,
        this.frustumSize,
        -this.frustumSize,
        -50,
        100,
      )
    }
    else {
      this.instance = new THREE.PerspectiveCamera(
        34,
        this.sizes.width / this.sizes.height,
        0.1,
        100,
      )
    }

    // 初始位置使用固定点位 0
    this.instance.position.copy(this.fixedPoints[this.currentIndex])
    this.instance.lookAt(this.target)
    this.scene.add(this.instance)
  }

  setControls() {
    // 鼠标自由旋转（OrbitControls）
    this.orbitControls = new OrbitControls(this.instance, this.canvas)
    this.orbitControls.enableDamping = true
    // 禁止视角平移，只允许围绕目标旋转与缩放
    this.orbitControls.enablePan = false
    // 允许滚轮缩放远近
    this.orbitControls.enableZoom = true
    this.orbitControls.zoomSpeed = 1.0
    this.orbitControls.enableRotate = true // 允许鼠标绕目标点旋转
    // 限制俯仰角范围（极角，单位弧度），避免视角过平或翻转到底部
    this.orbitControls.minPolarAngle = Math.PI * 0.2
    this.orbitControls.maxPolarAngle = Math.PI * 0.48
    this.orbitControls.dampingFactor = 0.3
    this.orbitControls.target.copy(this.target)

    // 根据相机类型设置缩放边界，避免滚轮缩放过近或过远
    if (this.orthographic) {
      this.orbitControls.minZoom = 0.5
      this.orbitControls.maxZoom = 4
    }
    else {
      this.orbitControls.minDistance = 5
      this.orbitControls.maxDistance = 80
    }
  }

  setDebug() {
    if (this.debugActive) {
      const folder = this.debug.ui.addFolder({ title: 'Camera', expanded: false })
      folder.addBinding(this.instance, 'position', { label: 'Position' })
        .on('change', () => this.instance.lookAt(this.target))
    }
  }

  resize() {
    if (this.orthographic) {
      const aspect = this.sizes.width / this.sizes.height
      this.instance.left = -this.frustumSize * aspect
      this.instance.right = this.frustumSize * aspect
      this.instance.top = this.frustumSize
      this.instance.bottom = -this.frustumSize
      this.instance.updateProjectionMatrix()
    }
    else {
      this.instance.aspect = this.sizes.width / this.sizes.height
      this.instance.updateProjectionMatrix()
    }
  }

  update() {
    this.orbitControls.update()
  }
}
