export type MsgType =
	| "text"
	| "post"
	| "image"
	| "file"
	| "audio"
	| "media"
	| "sticker"
	| "interactive"
	| "share_chat"
	| "share_user";

export interface FormattedMessage {
	header: string;
	body: string;
	meta: Record<string, string>;
}

/**
 * Build a compact, structured tmux injection line for any message type.
 */
export function formatInjection(
	messageId: string,
	msgType: MsgType,
	chatType: string,
	content: string,
): FormattedMessage {
	const header = `[FS mid=${messageId} type=${msgType} chat=${chatType}]`;

	switch (msgType) {
		case "text":
			return { header, body: content, meta: {} };

		case "post": {
			// Extract readable text from post content blocks
			const parsed = JSON.parse(content);
			const lang = parsed.zh_cn || parsed.en_us || (Object.values(parsed)[0] as any);
			const title = lang?.title ? `标题: ${lang.title}` : "";
			const lines: string[] = title ? [title] : [];
			if (lang?.content) {
				for (const block of lang.content) {
					for (const seg of block) {
						if (seg.tag === "text") lines.push(seg.text);
						else if (seg.tag === "a") lines.push(`[链接: ${seg.href}] (${seg.text})`);
						else if (seg.tag === "at") lines.push(`@${seg.user_id}`);
					}
				}
			}
			return {
				header,
				body: lines.join("\n") || "(空富文本)",
				meta: { title: title || "", segment_count: String(lang?.content?.length ?? 0) },
			};
		}

		case "image": {
			const p = JSON.parse(content);
			return {
				header,
				body: `图片消息\nimage_key: ${p.image_key}`,
				meta: { image_key: p.image_key, size: p.image_size ?? "unknown" },
			};
		}

		case "file": {
			const p = JSON.parse(content);
			return {
				header,
				body: `文件: ${p.file_name ?? "unknown"}\nfile_key: ${p.file_key}`,
				meta: {
					file_key: p.file_key,
					file_name: p.file_name ?? "",
					file_size: p.file_size ?? "unknown",
				},
			};
		}

		case "audio": {
			const p = JSON.parse(content);
			return {
				header,
				body: `语音消息\nfile_key: ${p.file_key}\n时长: ${p.duration ?? "?"}s`,
				meta: { file_key: p.file_key, duration: p.duration ?? "" },
			};
		}

		case "media": {
			const p = JSON.parse(content);
			return {
				header,
				body: `视频消息\nfile_key: ${p.file_key}\nimage_key: ${p.image_key ?? ""}`,
				meta: { file_key: p.file_key, image_key: p.image_key ?? "" },
			};
		}

		case "sticker":
			return { header, body: "表情包", meta: {} };

		case "interactive": {
			const p = JSON.parse(content);
			const title = p.header?.title?.content || p.config?.title || "";
			const bodyParts: string[] = [];
			if (title) bodyParts.push(`卡片: ${title}`);
			if (p.elements) {
				for (const el of p.elements) {
					if (el.tag === "markdown") bodyParts.push(el.content || "");
					if (el.tag === "div") {
						const text = el.text?.content || el.text || "";
						if (text) bodyParts.push(text);
					}
					if (el.tag === "action") {
						const labels = (el.actions || [])
							.map((a: any) => a.text?.content || a.tag || "")
							.filter(Boolean);
						if (labels.length) bodyParts.push(`[按钮] ${labels.join(" | ")}`);
					}
				}
			}
			return { header, body: bodyParts.join("\n") || "(空卡片)", meta: { card_title: title } };
		}

		case "share_chat": {
			const p = JSON.parse(content);
			return { header, body: `分享群聊: ${p.chat_id}`, meta: { chat_id: p.chat_id } };
		}

		case "share_user": {
			const p = JSON.parse(content);
			return { header, body: `分享联系人: ${p.user_id}`, meta: { user_id: p.user_id } };
		}

		default:
			return { header, body: content, meta: {} };
	}
}
