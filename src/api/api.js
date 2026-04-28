import { get, post, put, del, upload, download, config } from "./http";

// 用户登录
export const userLogin = (data) => {
	return post("/app-api/system/auth/appLogin", data);
};

