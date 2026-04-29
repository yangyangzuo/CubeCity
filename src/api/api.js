import { get, post, put, del, upload, download, config } from "./http";

// 用户登录
export const userLogin = (data) => {
	return post("/app-api/system/auth/appLogin", data);
};

// 退出登录
export const userLogout = () => {
	return post("/app-api/system/auth/logout");
};

// 保存用户游戏数据
export const saveGameData = (data) => {
	return post("/app-api/play/gameData/save", data);
};

// 获取用户的游戏数据
export const getGameData = () => {
	return get("/app-api/play/gameData/get");
};

// 校验当前时间段和剩余时长是否允许游玩
export const checkPlayTime = (data) => {
	return post("/app-api/play/checkPlayTime", data);
};

// 退出游戏并更新游玩时长
export const exitGame = (data) => {
	return post("/app-api/play/exitGame", data);
};

// 保存或更新运营配置
export const savePlayConfig = (data) => {
	return post("/app-api/play/config/save", data);
};

// 查询运营配置
export const getPlayConfigList = (data) => {
	return post("/app-api/play/config/list", data);
};

// 查询当前用户命中的运营配置
export const getCurrentPlayConfig = (params) => {
	return get("/app-api/play/config/current", params);
};
