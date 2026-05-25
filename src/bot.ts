import path from "node:path";
import Lark from "@larksuiteoapi/node-sdk";
import { createApiServer } from "./api-server.js";
import { makeLogger } from "./logger.js";
import { downloadResource, ensureDownloadDir } from "./media.js";
import { formatInjection } from "./messages.js";
import { makeRouteStore } from "./route-store.js";
import { createTmuxQueue, ensureTmuxSession } from "./tmux.js";
import type { BotConfig } from "./types.js";

function buildInitText(port: number): string {
	return `[feishu-tmux-bot :${port}]  发现能力: curl -s localhost:${port}/capabilities`;
}

export async function startBot(cfg: BotConfig) {
	const logger = makeLogger(cfg.name);
	const target = cfg.session + (cfg.pane || ":0.0");
	const dbPath = path.join(import.meta.dirname, "..", "logs", `${cfg.name}-route.db.json`);
	const routeStore = makeRouteStore(dbPath, logger);

	ensureDownloadDir(logger);

	logger.log(`启动: session=${cfg.session} target=${target} port=${cfg.port}`);

	const client: any = new Lark.Client({
		appId: cfg.app_id,
		appSecret: cfg.app_secret,
	});
	const wsClient: any = new Lark.WSClient({
		appId: cfg.app_id,
		appSecret: cfg.app_secret,
		loggerLevel: Lark.LoggerLevel.info,
	});

	// HTTP API
	const apiApp = createApiServer({
		port: cfg.port,
		routeStore,
		client,
		logger,
	});
	await apiApp.listen({ port: cfg.port });
	logger.log(`API: http://localhost:${cfg.port}`);

	// tmux message queue (serialized injection)
	const tmuxQueue = createTmuxQueue(target, logger);

	// startup injection — one-line badge
	if (cfg.no_inject) {
		logger.log("[init] no_inject=true, 跳过");
	} else {
		setTimeout(() => {
			tmuxQueue
				.enqueue(buildInitText(cfg.port))
				.then(() => logger.log("[init] 注入完成"))
				.catch((e: Error) => logger.error(`[init] 注入失败: ${e.message}`));
		}, 2000);
	}

	// health check (with auto-recovery)
	function healthCheck() {
		ensureTmuxSession(cfg.session, logger).then((ok) => {
			if (ok) logger.log(`[健康检查] session ${cfg.session} OK`);
		});
	}
	setInterval(healthCheck, 30 * 60 * 1000);
	healthCheck();

	// WebSocket event handling
	let lastWsReadyAt = 0;
	let lastMessageAt = 0;

	wsClient.onReady = () => {
		lastWsReadyAt = Date.now();
		logger.log("[ws] 长连接已建立");
	};
	wsClient.onError = (err: Error) => logger.error(`[ws] 错误: ${err.message || err}`);
	wsClient.onReconnecting = () => logger.log("[ws] 重连中...");
	wsClient.onReconnected = () => {
		lastWsReadyAt = Date.now();
		logger.log("[ws] 重连成功");
	};

	const dispatcher = new Lark.EventDispatcher({});
	const _invoke = dispatcher.invoke.bind(dispatcher);
	dispatcher.invoke = (event: { type?: string }) => {
		const type = event?.type ? event.type : String(event).substring(0, 60);
		logger.log(`[event] ${type}`);
		return _invoke(event);
	};

	dispatcher.register({
		"im.message.receive_v1": async (data: any) => {
			const msg = data.message;
			const sender = data.sender;
			const chatType = msg.chat_type;
			const chatId = msg.chat_id;
			const messageId = msg.message_id;
			const openId = sender?.sender_id?.open_id || "";
			const content = JSON.parse(msg.content || "{}");
			const msgType: string = msg.msg_type || "text";

			lastMessageAt = Date.now();

			// Store route for all message types
			routeStore.put(messageId, {
				chat_type: chatType as "group" | "private",
				chat_id: chatId,
				open_id: openId,
			});

			// Auto-ACK with 👍 reaction for any incoming message
			try {
				await client.im.v1.messageReaction.create({
					data: { reaction_type: { emoji_type: "thumbsup" } },
					path: { message_id: messageId },
				});
			} catch {}

			// Format injection text based on message type
			let injectText: string;
			if (msgType === "text") {
				const msgText: string = content.text || "";
				if (!msgText.trim()) {
					logger.log("[message] 空文本消息");
					return;
				}
				const formatted = formatInjection(messageId, "text", chatType, msgText);
				injectText = `${formatted.header}\n${formatted.body}`;
				logger.log(`[收到消息] chat=${chatType} type=text text=${msgText.substring(0, 40)}`);
			} else {
				// Non-text messages: use formatInjection for structured output
				const formatted = formatInjection(messageId, msgType as any, chatType, msg.content || "{}");
				injectText = `${formatted.header}\n${formatted.body}`;
				logger.log(`[收到消息] chat=${chatType} type=${msgType}`);

				// Auto-download images and files
				if (["image", "file", "audio", "media"].includes(msgType)) {
					const fileKey = content.image_key || content.file_key;
					const type = msgType === "image" ? "image" : "file";
					if (fileKey) {
						const dlPath = await downloadResource(client, messageId, fileKey, type, logger);
						if (dlPath) {
							injectText += `\n已下载到: ${dlPath}`;
						}
					}
				}
			}

			// Inject to tmux
			if (!cfg.no_inject && injectText) {
				try {
					logger.log(`[inject] mid=${messageId.substring(0, 10)}... type=${msgType}`);
					await tmuxQueue.enqueue(injectText);
					logger.log(`[inject] 完成: mid=${messageId.substring(0, 10)}...`);
				} catch (e) {
					logger.error(`[inject] 失败: ${(e as Error).message}`);
					try {
						await client.im.v1.message.create({
							params: {
								receive_id_type: chatType === "group" ? "chat_id" : "open_id",
							},
							data: {
								receive_id: chatType === "group" ? chatId : openId,
								msg_type: "text",
								content: JSON.stringify({ text: `执行失败: ${(e as Error).message}` }),
							},
						});
					} catch {}
				}
			} else if (cfg.no_inject) {
				logger.log(`[message] no_inject, 跳过: type=${msgType}`);
			}
		},

		"im.message.message_read_v1": async () => {},

		// Reaction events
		"im.message.reaction.created_v1": async (data: any) => {
			const { message_id, reaction_type, user_id, operator_type } = data;
			const emoji = reaction_type?.emoji_type || "?";
			const op = operator_type === "bot" ? "[bot]" : user_id?.open_id || user_id || "?";
			const injectText = `[FS mid=${message_id} type=reaction_add] ${op} emoji=${emoji}`;
			if (!cfg.no_inject) {
				tmuxQueue.enqueue(injectText).catch(() => {});
			}
		},

		"im.message.reaction.deleted_v1": async (data: any) => {
			const { message_id, reaction_type, user_id, operator_type } = data;
			const emoji = reaction_type?.emoji_type || "?";
			const op = operator_type === "bot" ? "[bot]" : user_id?.open_id || user_id || "?";
			const injectText = `[FS mid=${message_id} type=reaction_remove] ${op} emoji=${emoji}`;
			if (!cfg.no_inject) {
				tmuxQueue.enqueue(injectText).catch(() => {});
			}
		},
	});

	wsClient
		.start({ eventDispatcher: dispatcher })
		.then(() => logger.log("[ws] start OK"))
		.catch((e: Error) => logger.error(`[ws] start 失败: ${e.message || e}`));

	// heartbeat
	setInterval(() => {
		logger.log(
			`[heartbeat] wsReady=${
				lastWsReadyAt ? new Date(lastWsReadyAt).toISOString() : "never"
			} lastMsg=${lastMessageAt ? new Date(lastMessageAt).toISOString() : "never"}`,
		);
	}, 60 * 1000);

	return { client, wsClient, apiApp, logger };
}
