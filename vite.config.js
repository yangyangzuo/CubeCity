import path from 'node:path'

import { partytownVite } from '@builder.io/partytown/utils'
import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import glsl from 'vite-plugin-glsl'

import _config from './_config'

const HOST = _config.server.host
const PORT = _config.server.port

export default defineConfig(({ mode }) => {
  // 根据启动 mode 加载对应 .env 文件（如 .env.development / .env.production）
  const env = loadEnv(mode, process.cwd(), '')
  const protocol = env.VITE_SERVER_PROTOCOL || 'http'
  const host = env.VITE_SERVER_HOST || '127.0.0.1'
  const port = env.VITE_SERVER_PORT || '8080'
  const target = `${protocol}://${host}:${port}`

  return {
    // 打包使用相对路径，适配非站点根目录部署
    base: './',
    server: {
      // 本地开发代理：按启动方式读取对应环境变量
      proxy: {
        '/app-api': {
          target,
          changeOrigin: true,
        },
      },
    },
    // 预览模式同样支持代理，避免与开发环境行为不一致
    preview: {
      host: HOST,
      port: PORT,
      proxy: {
        '/app-api': {
          target,
          changeOrigin: true,
        },
      },
    },
    plugins: [
      vue(),
      legacy(),
      glsl(),
      partytownVite({
        dest: path.join(__dirname, 'dist', '~partytown'),
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
