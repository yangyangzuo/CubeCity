import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { createApp, watch } from 'vue'
import { createI18n } from 'vue-i18n'
import { saveGameData } from './api/api.js'
import App from './App.vue'
import en from './assets/i18n/en.json'
import zh from './assets/i18n/zh.json'
import { useGameState } from './stores/useGameState.js'
import './css/global.css'
import './scss/global.scss'
import './scss/index.scss'

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

// 先创建并读取持久化的语言设置
const gameState = useGameState()

// 仅限制后端保存频率：5s 内多次变更只保存最后一次
const BACKEND_SAVE_DEBOUNCE_MS = 5000
let backendSaveTimer = null
let pendingSerializedState = ''
let isBackendSavingScheduled = false

// 监听 gameState 的每次变更：
// - 本地 localStorage 持久化仍由 persist 插件实时处理（不受限制）
// - 后端保存按 5s 窗口合并：窗口内多次变更仅保存最后一次
gameState.$subscribe(
  (_mutation, state) => {
    pendingSerializedState = JSON.stringify(state)
    if (isBackendSavingScheduled) {
      return
    }
    isBackendSavingScheduled = true
    backendSaveTimer = setTimeout(async () => {
      try {
        await saveGameData({
          gameData: pendingSerializedState,
        })
      } catch (error) {
        // 后端存档失败不阻断前端流程，仅记录日志便于排查
        console.error('同步保存 gameData 失败:', error)
      } finally {
        isBackendSavingScheduled = false
        backendSaveTimer = null
      }
    }, BACKEND_SAVE_DEBOUNCE_MS)
  },
  { detached: true },
)

// 使用持久化语言初始化 i18n，避免初次渲染语言回退
const i18n = createI18n({
  legacy: false,
  locale: gameState.language,
  fallbackLocale: 'en',
  messages: { zh, en },
  // 文案为仓库内静态 JSON，且多处用 v-html 展示样式；关闭「翻译串含 HTML」的控制台告警（非用户输入）
  warnHtmlMessage: false,
})

app.use(i18n)

// 挂载前同步一次，确保初始渲染使用正确语言
i18n.global.locale.value = gameState.language

app.mount('#app')

// 监听 pinia 语言变化，动态切换 i18n 语言（立即执行以覆盖初始渲染）
watch(
  () => gameState.language,
  (lang) => {
    i18n.global.locale.value = lang
  },
  { immediate: true },
)
