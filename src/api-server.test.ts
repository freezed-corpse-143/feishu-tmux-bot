import { describe, expect, it, vi } from "vitest";
import { createApiServer } from "./api-server.js";
import type { ChatRoute } from "./types.js";

function makeMockClient() {
	const createMsg = vi.fn().mockResolvedValue({});
	const createReaction = vi.fn().mockResolvedValue({});
	const listReactions = vi.fn().mockResolvedValue({ data: { items: [] } });
	const deleteReaction = vi.fn().mockResolvedValue({});
	const getMessage = vi.fn().mockResolvedValue({ data: { items: [] } });
	const listMessages = vi.fn().mockResolvedValue({ data: { items: [], has_more: false } });
	const getResource = vi
		.fn()
		.mockResolvedValue({ writeFile: vi.fn().mockResolvedValue(undefined) });
	const createImage = vi.fn().mockResolvedValue({ image_key: "img_test" });
	const createFile = vi.fn().mockResolvedValue({ file_key: "file_test" });

	return {
		im: {
			v1: {
				message: { create: createMsg },
				messageReaction: { create: createReaction },
			},
			message: {
				get: getMessage,
				list: listMessages,
			},
			messageReaction: {
				list: listReactions,
				delete: deleteReaction,
			},
			messageResource: {
				get: getResource,
			},
			image: { create: createImage },
			file: { create: createFile },
		},
		// reference shortcuts for assertions
		_createMsg: createMsg,
		_createReaction: createReaction,
		_listReactions: listReactions,
		_deleteReaction: deleteReaction,
		_getMessage: getMessage,
		_listMessages: listMessages,
		_getResource: getResource,
		_createImage: createImage,
		_createFile: createFile,
	};
}

function makeMockStore() {
	const map = new Map<string, ChatRoute>();
	return {
		put(key: string, value: ChatRoute) {
			map.set(key, value);
		},
		get(key: string) {
			return map.get(key);
		},
		has(key: string) {
			return map.has(key);
		},
	};
}

function makeTestLogger() {
	return {
		log: vi.fn(),
		error: vi.fn(),
	};
}

function setup() {
	const client: any = makeMockClient();
	const store = makeMockStore();
	const logger = makeTestLogger();
	const app = createApiServer({ port: 0, routeStore: store, client, logger });
	// seed a route
	store.put("om_001", { chat_type: "private", chat_id: "oc_test", open_id: "ou_test" });
	store.put("om_002", { chat_type: "group", chat_id: "oc_group", open_id: "" });
	return { app, client, store, logger };
}

describe("/health", () => {
	it("returns ok", async () => {
		const { app } = setup();
		const res = await app.inject({ method: "GET", url: "/health" });
		expect(res.statusCode).toBe(200);
		const body = res.json<{ status: string }>();
		expect(body.status).toBe("ok");
	});
});

describe("/capabilities", () => {
	it("returns version and methods", async () => {
		const { app } = setup();
		const res = await app.inject({ method: "GET", url: "/capabilities" });
		expect(res.statusCode).toBe(200);
		const body = res.json<{ version: string; methods: unknown[] }>();
		expect(body.version).toBeDefined();
		expect(body.methods.length).toBeGreaterThan(0);
	});
});

describe("/send", () => {
	it("returns 400 if missing message_id", async () => {
		const { app } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/send",
			payload: { text: "hi" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("returns 400 if route not found", async () => {
		const { app } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/send",
			payload: { message_id: "om_999", text: "hi" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("sends text reply", async () => {
		const { app, client } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/send",
			payload: { message_id: "om_001", text: "回复内容" },
		});
		expect(res.statusCode).toBe(200);
		expect(client._createMsg).toHaveBeenCalledOnce();
	});
});

describe("/reply", () => {
	it("returns 400 without message_id", async () => {
		const { app } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/reply",
			payload: { text: "hi" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("sends text by default", async () => {
		const { app, client } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/reply",
			payload: { message_id: "om_001", text: "你好" },
		});
		expect(res.statusCode).toBe(200);
		expect(client._createMsg).toHaveBeenCalled();
	});

	it("sends group reply with chat_id", async () => {
		const { app, client } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/reply",
			payload: { message_id: "om_002", text: "群消息" },
		});
		expect(res.statusCode).toBe(200);
		const call = client._createMsg.mock.calls[0][0];
		expect(call.params.receive_id_type).toBe("chat_id");
		expect(call.data.receive_id).toBe("oc_group");
	});
});

describe("/react", () => {
	it("returns 400 without required fields", async () => {
		const { app } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/react",
			payload: { message_id: "om_001" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("adds reaction by default", async () => {
		const { app, client } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/react",
			payload: { message_id: "om_001", emoji: "thumbsup" },
		});
		expect(res.statusCode).toBe(200);
		expect(client._createReaction).toHaveBeenCalledOnce();
	});
});

describe("/upload", () => {
	it("returns 400 without file", async () => {
		const { app } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/upload",
		});
		expect(res.statusCode).toBe(400);
	});
});

describe("/download/:message_id", () => {
	it("returns 400 for text messages", async () => {
		const { app, client } = setup();
		client._getMessage.mockResolvedValue({
			data: { items: [{ msg_type: "text", body: {} }] },
		});
		const res = await app.inject({
			method: "GET",
			url: "/download/om_003",
		});
		expect(res.statusCode).toBe(400);
	});

	it("downloads image message", async () => {
		const { app, client } = setup();
		client._getMessage.mockResolvedValue({
			data: {
				items: [
					{
						msg_type: "image",
						body: { content: JSON.stringify({ image_key: "img_abc" }) },
					},
				],
			},
		});
		const res = await app.inject({
			method: "GET",
			url: "/download/om_003",
		});
		expect(res.statusCode).toBe(200);
		const body = res.json<{ ok: boolean; path: string }>();
		expect(body.ok).toBe(true);
		expect(body.path).toContain("downloads");
	});
});

describe("/history/:chat_id", () => {
	it("returns messages list", async () => {
		const { app, client } = setup();
		client._listMessages.mockResolvedValue({
			data: {
				has_more: false,
				items: [
					{
						message_id: "om_h1",
						msg_type: "text",
						body: { content: '{"text":"hello"}' },
						create_time: "1620000000000",
					},
				],
			},
		});
		const res = await app.inject({
			method: "GET",
			url: "/history/oc_chat?limit=10",
		});
		expect(res.statusCode).toBe(200);
		const body = res.json<{ ok: boolean; messages: unknown[] }>();
		expect(body.ok).toBe(true);
		expect(body.messages.length).toBe(1);
	});
});

describe("/message/:message_id", () => {
	it("returns 404 for missing message", async () => {
		const { app, client } = setup();
		client._getMessage.mockResolvedValue({ data: { items: [] } });
		const res = await app.inject({
			method: "GET",
			url: "/message/om_missing",
		});
		expect(res.statusCode).toBe(404);
	});

	it("returns single message", async () => {
		const { app, client } = setup();
		client._getMessage.mockResolvedValue({
			data: {
				items: [
					{
						message_id: "om_msg1",
						msg_type: "text",
						chat_id: "oc_chat",
						body: { content: '{"text":"hello"}' },
						create_time: "1620000000000",
					},
				],
			},
		});
		const res = await app.inject({
			method: "GET",
			url: "/message/om_msg1",
		});
		expect(res.statusCode).toBe(200);
		const body = res.json<{ ok: boolean; message: unknown }>();
		expect(body.ok).toBe(true);
		expect(body.message).toBeDefined();
	});
});

describe("/card", () => {
	it("returns 400 without message_id", async () => {
		const { app } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/card",
			payload: { title: "Test" },
		});
		expect(res.statusCode).toBe(400);
	});

	it("sends a simple card", async () => {
		const { app, client } = setup();
		const res = await app.inject({
			method: "POST",
			url: "/card",
			payload: {
				message_id: "om_001",
				title: "卡片标题",
				markdown: "这是**内容**",
				buttons: [{ label: "确认", type: "primary" }],
			},
		});
		expect(res.statusCode).toBe(200);
		expect(client._createMsg).toHaveBeenCalledOnce();
		const call = client._createMsg.mock.calls[0][0];
		expect(call.data.msg_type).toBe("interactive");
	});
});
