<script setup>
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useBuilding } from '@/hooks/useBuilding.js'
import { eventBus } from '@/js/utils/event-bus.js'
// 全局对话层：订阅 mitt 以展示确认弹窗，并在内部完成交易
import { onMounted, onUnmounted, ref, watchEffect } from 'vue'

/** 无操作时自动关闭确认框的毫秒数 */
const AUTO_CLOSE_MS = 5000

// 弹窗可见与数据
const show = ref(false)
const dialogData = ref(null)
const { getDialogConfig, handleBuildingTransaction } = useBuilding()

// 弹窗打开期间仅保留一个定时器；须同时读取 show 与 dialogData，避免短路导致 dialogData 未收集依赖、计时器不重启
watchEffect((onCleanup) => {
  const open = show.value
  const data = dialogData.value
  if (!open || !data)
    return
  const id = window.setTimeout(() => {
    show.value = false
  }, AUTO_CLOSE_MS)
  onCleanup(() => {
    window.clearTimeout(id)
  })
})

// 处理 UI 侧触发的确认动作
function onAskConfirm(payload) {
  // 根据 action / buildingType / buildingLevel 生成配置
  dialogData.value = getDialogConfig(payload.action, payload.buildingType, payload.buildingLevel)
  if (dialogData.value) {
    show.value = true
    // dialogData 更新会触发上方 watchEffect，自动重置 5 秒计时
  }
}

// 点击确认：执行交易并广播结果
function onConfirm() {
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
  show.value = false
}

onMounted(() => {
  eventBus.on('ui:confirm-action', onAskConfirm)
})
onUnmounted(() => {
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
