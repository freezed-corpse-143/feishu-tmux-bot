import { describe, expect, it } from "vitest";
import { formatInjection } from "./messages.js";

describe("formatInjection", () => {
	it("formats text message", () => {
		const result = formatInjection("om_001", "text", "group", "你好");
		expect(result.header).toBe("[FS mid=om_001 type=text chat=group]");
		expect(result.body).toBe("你好");
	});

	it("formats post (rich text) message", () => {
		const postContent = JSON.stringify({
			zh_cn: {
				title: "通知",
				content: [
					[{ tag: "text", text: "大家好" }],
					[{ tag: "a", text: "链接", href: "https://example.com" }],
					[{ tag: "at", user_id: "ou_123" }],
				],
			},
		});
		const result = formatInjection("om_002", "post", "group", postContent);
		expect(result.header).toContain("type=post");
		expect(result.body).toContain("标题: 通知");
		expect(result.body).toContain("大家好");
		expect(result.body).toContain("[链接: https://example.com] (链接)");
		expect(result.body).toContain("@ou_123");
	});

	it("formats image message", () => {
		const content = JSON.stringify({ image_key: "img_abc123" });
		const result = formatInjection("om_003", "image", "private", content);
		expect(result.header).toContain("type=image");
		expect(result.body).toContain("img_abc123");
		expect(result.meta.image_key).toBe("img_abc123");
	});

	it("formats file message", () => {
		const content = JSON.stringify({
			file_key: "file_xyz",
			file_name: "report.pdf",
			file_size: "2048000",
		});
		const result = formatInjection("om_004", "file", "group", content);
		expect(result.header).toContain("type=file");
		expect(result.body).toContain("report.pdf");
		expect(result.meta.file_name).toBe("report.pdf");
	});

	it("formats sticker message", () => {
		const result = formatInjection("om_005", "sticker", "group", "{}");
		expect(result.header).toContain("type=sticker");
		expect(result.body).toBe("表情包");
	});

	it("formats interactive card", () => {
		const content = JSON.stringify({
			header: { title: { content: "卡片标题" } },
			elements: [
				{ tag: "markdown", content: "这是 **markdown** 内容" },
				{
					tag: "action",
					actions: [
						{ tag: "button", text: { content: "确认" } },
						{ tag: "button", text: { content: "取消" } },
					],
				},
			],
		});
		const result = formatInjection("om_006", "interactive", "group", content);
		expect(result.header).toContain("type=interactive");
		expect(result.body).toContain("卡片: 卡片标题");
		expect(result.body).toContain("这是 **markdown** 内容");
		expect(result.body).toContain("[按钮] 确认 | 取消");
	});

	it("formats share_chat", () => {
		const content = JSON.stringify({ chat_id: "oc_share" });
		const result = formatInjection("om_007", "share_chat", "private", content);
		expect(result.body).toContain("oc_share");
	});

	it("formats share_user", () => {
		const content = JSON.stringify({ user_id: "ou_user" });
		const result = formatInjection("om_008", "share_user", "private", content);
		expect(result.body).toContain("ou_user");
	});
});
