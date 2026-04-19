<script setup>
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useBuilding } from '@/hooks/useBuilding.js'
import { eventBus } from '@/js/utils/event-bus.js'
// 全局对话层：订阅 mitt 以展示确认弹窗，并在内部完成交易
import { onMounted, onUnmounted, ref, watch } from 'vue'

/** 无操作时自动关闭确认框的毫秒数 */
const AUTO_CLOSE_MS = 5000

// 弹窗可见与数据
const show = ref(false)
const dialogData = ref(null)
const { getDialogConfig, handleBuildingTransaction } = useBuilding()

let autoCloseTimer = null

function clearAutoCloseTimer() {
  if (autoCloseTimer != null) {
    clearTimeout(autoCloseTimer)
    autoCloseTimer = null
  }
}

/** 在弹窗展示期间启动/重置自动关闭计时器 */
function scheduleAutoClose() {
  clearAutoCloseTimer()
  if (!show.value)
    return
  autoCloseTimer = window.setTimeout(() => {
    autoCloseTimer = null
    show.value = false
  }, AUTO_CLOSE_MS)
}

// show 从关到开时启动计时；关闭时清理
watch(show, (visible) => {
  if (visible)
    scheduleAutoClose()
  else
    clearAutoCloseTimer()
})

// 处理 UI 侧触发的确认动作
function onAskConfirm(payload) {
  // 根据 action / buildingType / buildingLevel 生成配置
  dialogData.value = getDialogConfig(payload.action, payload.buildingType, payload.buildingLevel)
  if (dialogData.value) {
    show.value = true
    // 连续弹出且 show 已为 true 时 Vue 可能不会再次触发 watch，需手动重置 5 秒
    scheduleAutoClose()
  }
}

// 点击确认：执行交易并广播结果
function onConfirm() {
  clearAutoCloseTimer()
  const ok = handleBuildingTransaction(
    dialogData.value.action,
    dialogData.value.buildingType,
    dialogData.value.buildingLevel,
  )
  if (ok) {
    eventBus.emit('ui:action-confirmed', dialogData.value.action)
  }
  show.value = false
}

// 点击取消：关闭弹窗
function onCancel() {
  clearAutoCloseTimer()
  show.value = false
}

onMounted(() => {
  eventBus.on('ui:confirm-action', onAskConfirm)
})
onUnmounted(() => {
  clearAutoCloseTimer()
  eventBus.off('ui:confirm-action', onAskConfirm)
})
</script>

<template>
  <!-- overlays 容器内需要启用交互 -->
  <div class="pointer-events-auto">
    <ConfirmDialog
      v-if="dialogData"
      :show="show"
      :title="dialogData.title"
      :message="dialogData.message"
      :confirm-text="dialogData.confirmText"
      :cancel-text="dialogData.cancelText"
      :action="dialogData.action"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </div>
</template>

<style scoped>
/* 无样式：继承 ConfirmDialog 的样式与主题 */
</style>
