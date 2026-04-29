import axios from "axios";
import { showToast } from "vant";

/**
 * 信息弹框提示组件（统一封装）
 * @param {String} message - 提示文案
 * @param {Number} duration - 持续时间
 */
const showInfoToast = (message, duration = 1000) => {
	showToast({
		message: message || "请求失败",
		duration,
	});
};

/**
 * 创建 axios 实例
 * 配置基础 URL、超时时间、请求头等
 */
const env = import.meta.env || {};
if (env.DEV) {
	var baseURL = "";
} else {
	var baseURL = env.VITE_SERVER_BASEURL;
}
console.log("axios-----baseURL::::::::", baseURL);

const http = axios.create({
	baseURL,
	timeout: 10000, // 请求超时时间 10 秒
	headers: {
		"Content-Type": "application/json;charset=utf-8",
		"tenant-id": 1,
	},
});

/**
 * 请求拦截器
 * 在发送请求之前对请求配置进行处理
 */
http.interceptors.request.use(
	(config) => {
		// console.log(config)
		// 在发送请求之前可以做些什么
		// 例如：添加 token、修改请求参数等
		const userInfo = JSON.parse(localStorage.getItem("user_info") || "{}");
		const token = userInfo.token;
		if (token) {
			config.headers["Authorization"] = `Bearer ${token}`;
		}
		// console.log("Request config:", config.url, config.baseURL, config.method, config.data);
		return config;
	},
	(error) => {
		// 对请求错误做些什么
		console.error("Request error:", error);
		return Promise.reject(error);
	},
);

var islogin = false;
/**
 * 响应拦截器
 * 在收到响应后对响应数据进行处理
 */
http.interceptors.response.use(
	(response) => {
		// console.log("响应结果:", response);
		const { status, data } = response;
		// HTTP 状态码处理
		if (status >= 200 && status < 300) {
			// 业务状态码处理
			if (data.code === 0) {
				return Promise.resolve(data);
			} else {
				// 业务错误处理
				if (data.code == 1) {
					showInfoToast(data.msg);
					return Promise.reject(data);
				} else {
					const errorMsg = data.msg || "请求失败";
					// 提示信息
					return Promise.reject(data);
				}
			}
		} else {
			// HTTP 错误处理
			let errorMsg = "请求失败";
			switch (status) {
				case 401:
					errorMsg = "未授权，请重新登录";
					// 清除登录信息
					// 跳转到登录页
					break;
				case 403:
					errorMsg = "拒绝访问";
					break;
				case 404:
					errorMsg = "请求地址不存在";
					break;
				case 500:
					errorMsg = "服务器内部错误";
					break;
				case 502:
					errorMsg = "网关错误";
					break;
				case 503:
					errorMsg = "服务不可用";
					break;
				case 504:
					errorMsg = "网关超时";
					break;
			}
			// 提示信息
			return Promise.reject({ code: status, message: errorMsg });
		}
	},
	(error) => {
		console.error("Response error:", error);
		if (error.response) {
			console.error("Error response:", error.response.status, error.response.data);
		}
		return Promise.reject(error);
	},
);

/**
 * GET 请求
 * @param {String} url - 请求地址
 * @param {Object} params - 请求参数（作为查询参数）
 * @param {Object} config - 额外的 axios 配置
 * @returns {Promise} 返回 Promise 对象
 */
export const get = (url, params, config) => {
	return http.get(url, { params, ...config });
};

/**
 * POST 请求
 * @param {String} url - 请求地址
 * @param {Object} data - 请求体数据
 * @param {Object} config - 额外的 axios 配置
 * @returns {Promise} 返回 Promise 对象
 */
export const post = (url, data, config) => {
	// 标准 POST：仅发送请求体，不自动拼接 URL 查询参数
	return http.post(url, data, config);
};

/**
 * PUT 请求
 * @param {String} url - 请求地址
 * @param {Object} data - 请求体数据
 * @param {Object} config - 额外的 axios 配置
 * @returns {Promise} 返回 Promise 对象
 */
export const put = (url, data, config) => {
	return http.put(url, data, config);
};

/**
 * DELETE 请求
 * @param {String} url - 请求地址
 * @param {Object} params - 请求参数（作为查询参数）
 * @param {Object} config - 额外的 axios 配置
 * @returns {Promise} 返回 Promise 对象
 */
export const del = (url, params, config) => {
	return http.delete(url, { params, ...config });
};

/**
 * 文件上传
 * @param {String} url - 请求地址
 * @param {FormData|Object} data - 上传的数据
 * @param {Object} config - 额外的 axios 配置（可包含 onUploadProgress 等）
 * @returns {Promise} 返回 Promise 对象
 */
export const upload = (url, data, config) => {
	return http.post(url, data, {
		...config,
		headers: {
			"Content-Type": "multipart/form-data",
			...config?.headers,
		},
	});
};

/**
 * 文件下载
 * @param {String} url - 请求地址
 * @param {Object} params - 请求参数（作为查询参数）
 * @param {String} filename - 下载的文件名（可选）
 * @param {Object} config - 额外的 axios 配置
 * @returns {Promise} 返回 Promise 对象
 */
export const download = (url, params, filename, config) => {
	return http
		.get(url, {
			params,
			...config,
			responseType: "blob",
		})
		.then((response) => {
			// 如果提供了文件名，创建下载链接
			if (filename) {
				const blob = new Blob([response]);
				const downloadUrl = window.URL.createObjectURL(blob);
				const link = document.createElement("a");
				link.href = downloadUrl;
				link.download = filename;
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				window.URL.revokeObjectURL(downloadUrl);
			}
			return response;
		});
};

/**
 * 通用请求方法
 * 支持自定义请求方法和配置
 * @param {Object} config - axios 请求配置对象
 * @returns {Promise} 返回 Promise 对象
 */
export const config = (config) => {
	return http.request(config);
};
