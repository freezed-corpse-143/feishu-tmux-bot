import fs from "node:fs/promises";
import path from "node:path";
import type { Logger } from "./types.js";

const DOWNLOAD_DIR = path.join(import.meta.dirname, "..", "downloads");

export function ensureDownloadDir(logger: Logger): void {
	fs.mkdir(DOWNLOAD_DIR, { recursive: true }).catch((e) =>
		logger.error(`[media] 创建 downloads 目录失败: ${(e as Error).message}`),
	);
}

export async function downloadResource(
	client: any,
	messageId: string,
	fileKey: string,
	type: string,
	logger: Logger,
): Promise<string | null> {
	try {
		const resp = await client.im.messageResource.get({
			params: { type },
			path: { message_id: messageId, file_key: fileKey },
		});

		const ext = type || "bin";
		const filename = `${messageId}_${fileKey}.${ext}`;
		const filePath = path.join(DOWNLOAD_DIR, filename);
		await resp.writeFile(filePath);
		logger.log(`[media] 下载完成: ${filePath}`);
		return filePath;
	} catch (e) {
		logger.error(`[media] 下载失败: ${(e as Error).message}`);
		return null;
	}
}

export async function uploadImage(
	client: any,
	filePath: string,
	logger: Logger,
): Promise<string | null> {
	try {
		const buf = await fs.readFile(filePath);
		const { image_key } = await client.im.image.create({
			data: { image_type: "message", image: buf },
		});
		logger.log(`[media] 图片上传完成: ${image_key}`);
		return image_key;
	} catch (e) {
		logger.error(`[media] 上传图片失败: ${(e as Error).message}`);
		return null;
	}
}

export async function uploadFile(
	client: any,
	filePath: string,
	fileType: string,
	fileName: string,
	logger: Logger,
): Promise<string | null> {
	try {
		const buf = await fs.readFile(filePath);
		const { file_key } = await client.im.file.create({
			data: {
				file_type: fileType,
				file_name: fileName,
				file: buf,
			},
		});
		logger.log(`[media] 文件上传完成: ${file_key}`);
		return file_key;
	} catch (e) {
		logger.error(`[media] 上传文件失败: ${(e as Error).message}`);
		return null;
	}
}
