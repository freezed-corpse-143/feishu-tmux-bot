import fastifyMultipart from "@fastify/multipart";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import iconv from "iconv-lite";
import { getCapabilities } from "./capabilities.js";
import { downloadResource, uploadFile, uploadImage } from "./media.js";
import type { ChatRoute, Logger } from "./types.js";

interface RouteStore {
	get(key: string): ChatRoute | undefined;
}

type LarkClient = any;

interface CreateApiServerOptions {
	port: number;
	routeStore: RouteStore;
	client: LarkClient;
	logger: Logger;
}

export function createApiServer(opts: CreateApiServerOptions): FastifyInstance {
	const { routeStore, client, logger } = opts;

	const app = Fastify({ logger: false });
	app.register(fastifyMultipart);

	// --- existing ---
	app.get("/health", async (_req, reply) => {
		return { status: "ok", ts: new Date().toISOString() };
	});

	// --- new: capabilities ---
	app.get("/capabilities", async (_req, reply) => {
		return getCapabilities();
	});

	// --- existing (backward compat) ---
	app.post<{ Body: { message_id: string; text: string } }>(
		"/send",
		{
			schema: {
				body: {
					type: "object",
					required: ["message_id", "text"],
					properties: {
						message_id: { type: "string", minLength: 1 },
						text: { type: "string", minLength: 1 },
					},
				},
			},
		},
		async (req, reply) => {
			const body = req.body;
			if (!body) {
				return reply.status(400).send({ ok: false, error: "请求体为空" });
			}
			return sendTextReply(client, routeStore, logger, body.message_id, body.text, reply);
		},
	);

	// --- new: unified reply ---
	app.post<{ Body: { message_id: string; text?: string; format?: string; content?: any } }>(
		"/reply",
		{
			schema: {
				body: {
					type: "object",
					required: ["message_id"],
					properties: {
						message_id: { type: "string", minLength: 1 },
						text: { type: "string" },
						format: { type: "string", enum: ["text", "post"] },
						content: { type: "object" },
					},
				},
			},
		},
		async (req, reply) => {
			const body = req.body;
			if (!body) {
				return reply.status(400).send({ ok: false, error: "请求体为空" });
			}

			const { message_id, text, format, content } = body;
			const route = routeStore.get(message_id);
			if (!route) {
				return reply.status(400).send({ ok: false, error: "message_id 不存在或已过期" });
			}

			const isGroup = route.chat_type === "group";
			const receiveId = isGroup ? route.chat_id : route.open_id;
			const receiveType = isGroup ? "chat_id" : "open_id";

			let msgType = "text";
			let payload: Record<string, unknown> = { text: text || "" };

			if (format === "post" && content) {
				msgType = "post";
				payload = content;
			}

			try {
				await client.im.v1.message.create({
					params: { receive_id_type: receiveType },
					data: {
						receive_id: receiveId,
						msg_type: msgType,
						content: JSON.stringify(payload),
					},
				});
				return { ok: true };
			} catch (e) {
				logger.error(`[api] reply 失败: ${(e as Error).message}`);
				return reply.status(500).send({ ok: false, error: (e as Error).message });
			}
		},
	);

	// --- new: react ---
	app.post<{ Body: { message_id: string; emoji: string; action?: string } }>(
		"/react",
		{
			schema: {
				body: {
					type: "object",
					required: ["message_id", "emoji"],
					properties: {
						message_id: { type: "string", minLength: 1 },
						emoji: { type: "string" },
						action: { type: "string", enum: ["add", "remove"] },
					},
				},
			},
		},
		async (req, reply) => {
			const body = req.body;
			if (!body) {
				return reply.status(400).send({ ok: false, error: "请求体为空" });
			}
			const { message_id, emoji, action } = body;

			try {
				if (action === "remove") {
					// Find and remove the bot's reaction
					const result = await client.im.messageReaction.list({
						path: { message_id },
						params: { reaction_type: emoji },
					});
					const botReaction = result?.data?.items?.find(
						(r: any) => r.operator?.operator_type === "bot",
					);
					if (botReaction?.reaction_id) {
						await client.im.messageReaction.delete({
							path: { message_id, reaction_id: botReaction.reaction_id },
						});
					}
				} else {
					await client.im.v1.messageReaction.create({
						data: { reaction_type: { emoji_type: emoji } },
						path: { message_id },
					});
				}
				return { ok: true };
			} catch (e) {
				logger.error(`[api] react 失败: ${(e as Error).message}`);
				return reply.status(500).send({ ok: false, error: (e as Error).message });
			}
		},
	);

	// --- new: upload ---
	app.post("/upload", async (req, reply) => {
		try {
			const data = await req.file();
			if (!data) {
				return reply.status(400).send({ ok: false, error: "未提供文件" });
			}

			const buf = await data.toBuffer();
			const mimeType = data.mimetype || "";
			const fileName = data.filename || "upload";

			if (mimeType.startsWith("image/")) {
				const { image_key } = await client.im.image.create({
					data: { image_type: "message", image: buf },
				});
				return { ok: true, image_key };
			}

			// Determine lark file type from extension
			const ext = fileName.split(".").pop()?.toLowerCase() || "stream";
			const fileTypeMap: Record<string, string> = {
				pdf: "pdf",
				doc: "doc",
				docx: "doc",
				xls: "xls",
				xlsx: "xls",
				ppt: "ppt",
				pptx: "ppt",
				mp4: "mp4",
				opus: "opus",
				mp3: "opus",
				ogg: "opus",
				wav: "opus",
			};
			const fileType = fileTypeMap[ext] || "stream";

			const { file_key } = await client.im.file.create({
				data: { file_type: fileType, file_name: fileName, file: buf },
			});
			return { ok: true, file_key };
		} catch (e) {
			logger.error(`[api] upload 失败: ${(e as Error).message}`);
			return reply.status(500).send({ ok: false, error: (e as Error).message });
		}
	});

	// --- new: download ---
	app.get<{ Params: { message_id: string } }>("/download/:message_id", async (req, reply) => {
		const { message_id } = req.params;

		try {
			const msgResp = await client.im.message.get({
				path: { message_id },
				params: { user_id_type: "open_id" },
			});

			const msg = msgResp?.data?.items?.[0];
			const msgType = msg?.msg_type;
			const body = msg?.body;
			const content = body ? JSON.parse(body.content || "{}") : {};

			if (!["image", "file", "audio", "media"].includes(msgType)) {
				return reply.status(400).send({ ok: false, error: "消息不含媒体资源" });
			}

			const fileKey = content.image_key || content.file_key;
			const type = msgType === "image" ? "image" : "file";

			const filePath = await downloadResource(client, message_id, fileKey, type, logger);
			if (!filePath) {
				return reply.status(500).send({ ok: false, error: "下载失败" });
			}

			return { ok: true, path: filePath, file_key: fileKey };
		} catch (e) {
			logger.error(`[api] download 失败: ${(e as Error).message}`);
			return reply.status(500).send({ ok: false, error: (e as Error).message });
		}
	});

	// --- new: history ---
	app.get<{ Params: { chat_id: string }; Querystring: { limit?: string } }>(
		"/history/:chat_id",
		async (req, reply) => {
			const { chat_id } = req.params;
			const limit = Number.parseInt(req.query.limit || "20");

			try {
				const result = await client.im.message.list({
					params: {
						container_id_type: "chat",
						container_id: chat_id,
						sort_type: "ByCreateTimeDesc",
						page_size: Math.min(limit, 50),
					},
				});

				const items = result?.data?.items || [];
				const messages = items.map((m: any) => ({
					message_id: m.message_id,
					msg_type: m.msg_type,
					body: m.body,
					create_time: m.create_time,
				}));

				return { ok: true, messages, has_more: result?.data?.has_more ?? false };
			} catch (e) {
				logger.error(`[api] history 失败: ${(e as Error).message}`);
				return reply.status(500).send({ ok: false, error: (e as Error).message });
			}
		},
	);

	// --- new: single message ---
	app.get<{ Params: { message_id: string } }>("/message/:message_id", async (req, reply) => {
		const { message_id } = req.params;

		try {
			const result = await client.im.message.get({
				path: { message_id },
				params: { user_id_type: "open_id" },
			});

			const item = result?.data?.items?.[0];
			if (!item) {
				return reply.status(404).send({ ok: false, error: "消息不存在" });
			}

			return {
				ok: true,
				message: {
					message_id: item.message_id,
					msg_type: item.msg_type,
					body: item.body,
					create_time: item.create_time,
					chat_id: item.chat_id,
				},
			};
		} catch (e) {
			logger.error(`[api] message 失败: ${(e as Error).message}`);
			return reply.status(500).send({ ok: false, error: (e as Error).message });
		}
	});

	// --- new: card ---
	app.post<{
		Body: {
			message_id: string;
			title?: string;
			markdown?: string;
			buttons?: Array<{ label: string; url?: string; type?: string }>;
		};
	}>(
		"/card",
		{
			schema: {
				body: {
					type: "object",
					required: ["message_id"],
					properties: {
						message_id: { type: "string", minLength: 1 },
						title: { type: "string" },
						markdown: { type: "string" },
						buttons: {
							type: "array",
							items: {
								type: "object",
								properties: {
									label: { type: "string" },
									url: { type: "string" },
									type: { type: "string" },
								},
							},
						},
					},
				},
			},
		},
		async (req, reply) => {
			const body = req.body;
			if (!body) {
				return reply.status(400).send({ ok: false, error: "请求体为空" });
			}

			const { message_id, title, markdown, buttons } = body;
			const route = routeStore.get(message_id);
			if (!route) {
				return reply.status(400).send({ ok: false, error: "message_id 不存在或已过期" });
			}

			const isGroup = route.chat_type === "group";

			const card: any = {
				config: { wide_screen_mode: true },
			};

			if (title) {
				card.header = {
					title: { content: title, tag: "plain_text" },
					template: "blue",
				};
			}

			const elements: any[] = [];
			if (markdown) {
				elements.push({ tag: "markdown", content: markdown });
			}

			if (buttons && buttons.length > 0) {
				elements.push({
					tag: "action",
					actions: buttons.map((b: any) => ({
						tag: "button",
						text: { tag: "plain_text", content: b.label },
						type: b.type || "default",
						url: b.url,
					})),
				});
			}

			if (elements.length > 0) {
				card.elements = elements;
			}

			try {
				await client.im.v1.message.create({
					params: { receive_id_type: isGroup ? "chat_id" : "open_id" },
					data: {
						receive_id: isGroup ? route.chat_id : route.open_id,
						msg_type: "interactive",
						content: JSON.stringify(card),
					},
				});
				return { ok: true };
			} catch (e) {
				logger.error(`[api] card 失败: ${(e as Error).message}`);
				return reply.status(500).send({ ok: false, error: (e as Error).message });
			}
		},
	);

	return app;
}

// --- helpers ---

async function sendTextReply(
	client: LarkClient,
	routeStore: RouteStore,
	logger: Logger,
	messageId: string,
	text: string,
	reply: any,
) {
	const route = routeStore.get(messageId);
	if (!route) {
		return reply.status(400).send({ ok: false, error: "message_id 不存在或已过期" });
	}

	const { chat_type, chat_id, open_id } = route;
	const isGroup = chat_type === "group";

	logger.log(`[api] 回复: mid=${messageId.substring(0, 10)}... text=${text.substring(0, 40)}`);

	try {
		await client.im.v1.message.create({
			params: { receive_id_type: isGroup ? "chat_id" : "open_id" },
			data: {
				receive_id: isGroup ? chat_id : open_id,
				msg_type: "text",
				content: JSON.stringify({ text }),
			},
		});
		return { ok: true };
	} catch (e) {
		logger.error(`[api] 失败: ${(e as Error).message}`);
		return reply.status(500).send({ ok: false, error: (e as Error).message });
	}
}

export function parseBody(req: {
	on(event: "data", cb: (chunk: Buffer) => void): void;
	on(event: "end", cb: () => void): void;
}): Promise<Record<string, unknown> | null> {
	return new Promise((resolve) => {
		const chunks: Buffer[] = [];
		req.on("data", (chunk: Buffer) =>
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
		);
		req.on("end", () => {
			const buffer = Buffer.concat(chunks);
			if (!buffer.length) return resolve(null);

			const tryParse = (t: string) => {
				try {
					return JSON.parse(t);
				} catch {
					return null;
				}
			};

			let j = tryParse(buffer.toString("utf8"));
			if (j) return resolve(j);
			j = tryParse(iconv.decode(buffer, "gbk"));
			resolve(j);
		});
	});
}
