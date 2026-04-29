// 默认游戏存档（当后端未返回 data 时使用）
export const defaultGameState = {
	metadata: Array.from({ length: 17 }, () =>
		Array.from({ length: 17 }, () => ({
			type: "grass",
			building: null,
			direction: 0,
		})),
	),
	currentMode: "build",
	selectedBuilding: null,
	selectedPosition: null,
	toastQueue: [],
	gameDay: 31,
	credits: 3000,
	territory: 16,
	cityLevel: 1,
	cityName: "HeXian City",
	citySize: 16,
	language: "zh",
	showMapOverview: false,
	musicEnabled: true,
	musicVolume: 0.5,
	isPlayingMusic: true,
	stability: 100,
	stabilityChangeRate: 0.1,
};

