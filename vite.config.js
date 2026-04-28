import path from "node:path";

import { partytownVite } from "@builder.io/partytown/utils";
import legacy from "@vitejs/plugin-legacy";
import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";
import glsl from "vite-plugin-glsl";

export default defineConfig(({ mode }) => {
	// 根据启动 mode 加载对应 .env 文件（如 .env.development / .env.production）
	const env = loadEnv(mode, process.cwd(), "");
	// 开发阶段默认代理到本地后端，未配置时使用 127.0.0.1:8080 兜底
	const baseurl = env.VITE_SERVER_BASEURL;
	console.log("vite-----baseurl::::::::", baseurl);



	return {
		// 打包使用相对路径，适配非站点根目录部署
		base: "./",
		server: {
			// 本地开发代理：按启动方式读取对应环境变量
			proxy: {
				"/app-api": {
					target: baseurl,
					changeOrigin: true,
				},
			},
		},
		plugins: [
			vue(),
			legacy(),
			glsl(),
			partytownVite({
				dest: path.join(__dirname, "dist", "~partytown"),
			}),
		],
		resolve: {
			alias: {
				"@": path.resolve(__dirname, "./src"),
			},
		},
	};
});
