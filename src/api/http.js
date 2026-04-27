import axios from "axios";

// 1. 创建实例并配置基础URL和超时时间
const createInstance = () => {
	const instance = axios.create({
		baseURL: process.env.VUE_APP_API_BASE_URL || "/api",
		timeout: 15000,
		headers: { "Content-Type": "application/json" },
	});
	return instance;
};

const instance = createInstance();

// ================= 拦截器 =================
// 2. 请求拦截器：处理token、headers、loading等。
instance.interceptors.request.use((config) => {
	// 自动携带 token
	const token = localStorage.getItem("token");
	if (token && config.needToken !== false) {
		config.headers.Authorization = `Bearer ${token}`;
	}

	// 处理不同 Content-Type
	if (config.data instanceof FormData) {
		config.headers["Content-Type"] = "multipart/form-data";
	}

	// 显示 loading
	if (config.needLoading !== false) {
		showLoading();
	}

	return config;
});

// 3. 响应拦截器：处理响应数据，错误状态码，关闭loading。
instance.interceptors.response.use(
	(response) => {
		hideLoading();

		// 处理业务数据 (根据项目接口调整)
		const res = response.data;
		if (res.code === 200) {
			return res.data;
		} else {
			const errorMsg = res.message || "请求失败";
			return Promise.reject(new Error(errorMsg));
		}
	},
	async (error) => {
		hideLoading();

		// 4. 统一错误处理：网络错误、HTTP状态码错误、业务逻辑错误。
		let errorMessage = "请求失败";
		if (error.response) {
			// HTTP 状态码错误
			switch (error.response.status) {
				case 401:
					errorMessage = "未授权，请重新登录";
					window.location.href = "/login";
					break;
				case 403:
					errorMessage = "拒绝访问";
					break;
				case 404:
					errorMessage = "请求资源不存在";
					break;
				case 500:
					errorMessage = "服务器错误";
					break;
				default:
					// 业务逻辑错误
					errorMessage = `请求错误: ${error.response.status}`;
			}
		} else if (error.request) {
			// 网络错误
			errorMessage = "网络连接异常";
		}

		alert(errorMessage); // 替换为实际提示方式
		return Promise.reject(error);
	},
);

// ================= 封装方法 =================
// 5. 封装请求方法：如get、post等，简化调用。
export const get = (url, params, config = {}) => instance.get(url, { params, ...config });

export const post = (url, data, config = {}) => instance.post(url, data, config);

export const put = (url, data, config = {}) => instance.put(url, data, config);

export const del = (url, params, config = {}) => instance.delete(url, { params, ...config });

export const upload = (url, file, fieldName = "file") => {
	const formData = new FormData();
	formData.append(fieldName, file);
	return post(url, formData, {
		headers: { "Content-Type": "multipart/form-data" },
	});
};

// ================= 辅助函数 =================
// Loading 控制
let loadingCount = 0;
const showLoading = () => {
	if (loadingCount === 0) {
		// 显示 loading 组件
	}
	loadingCount++;
};

const hideLoading = () => {
	loadingCount--;
	if (loadingCount <= 0) {
		// 隐藏 loading 组件
		loadingCount = 0;
	}
};

// // ================= 使用示例 =================

// // api.js
// import { get, post } from '@/utils/request';

// export const fetchUser = (id) => get('/user', { id });
// export const login = (data) => post('/login', data);
// export const uploadFile = (file) => upload('/upload', file);

// // 使用示例
// async function getData() {
// 	try {
// 		const user = await fetchUser(1);
// 	} catch (error) {
// 		console.error(error);
// 	}
// }
