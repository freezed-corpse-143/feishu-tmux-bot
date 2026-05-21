export const CAPABILITIES = {
	version: "2.0.0",
	methods: [
		{ name: "send", method: "POST", path: "/send", description: "回复纯文本消息（向后兼容）" },
		{
			name: "reply",
			method: "POST",
			path: "/reply",
			description: "统一回复（支持 text/post 格式）",
		},
		{ name: "react", method: "POST", path: "/react", description: "添加/删除表情回复" },
		{ name: "upload", method: "POST", path: "/upload", description: "上传文件/图片到飞书" },
		{
			name: "download",
			method: "GET",
			path: "/download/:message_id",
			description: "下载消息中的媒体资源",
		},
		{ name: "history", method: "GET", path: "/history/:chat_id", description: "拉取聊天历史" },
		{
			name: "message",
			method: "GET",
			path: "/message/:message_id",
			description: "获取单条消息详情",
		},
		{ name: "card", method: "POST", path: "/card", description: "发送交互式卡片" },
		{ name: "health", method: "GET", path: "/health", description: "健康检查" },
		{ name: "capabilities", method: "GET", path: "/capabilities", description: "返回能力清单" },
	],
};

export function getCapabilities() {
	return CAPABILITIES;
}
