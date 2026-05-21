import { spawn } from "node:child_process";
import type { Logger } from "./types.js";

const TMOUT_TMUX = Number.parseInt(process.env.TMOUT_TMUX || "5000");

export function runTmux(args: string[]): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const p = spawn("tmux", args, {
			shell: false,
			timeout: TMOUT_TMUX,
			stdio: ["ignore", "pipe", "pipe"],
		});
		let err = "";
		p.stderr?.on("data", (d: Buffer) => {
			err += d.toString();
		});
		p.on("error", reject);
		p.on("close", (code: number | null) => {
			if (code === 0) resolve();
			else reject(new Error(err.trim() || `tmux exited ${code}`));
		});
	});
}

export async function pasteToTmux(target: string, text: string, _logger: Logger): Promise<void> {
	const lines = text.split("\n");
	for (let i = 0; i < lines.length; i++) {
		if (lines[i].length > 0) {
			await runTmux(["send-keys", "-t", target, "-l", lines[i]]);
		}
		if (i < lines.length - 1) {
			await runTmux(["send-keys", "-t", target, "Escape"]);
			await runTmux(["send-keys", "-t", target, "Enter"]);
		}
	}
	await runTmux(["send-keys", "-t", target, "C-m"]);
}

export async function ensureTmuxSession(session: string, logger: Logger): Promise<boolean> {
	try {
		await runTmux(["has-session", "-t", session]);
		return true;
	} catch {
		logger.log(`[tmux] session ${session} 不存在，尝试创建...`);
		try {
			await runTmux(["new-session", "-d", "-s", session]);
			logger.log(`[tmux] session ${session} 已创建`);
			return true;
		} catch (e) {
			logger.error(`[tmux] 无法创建 session ${session}: ${(e as Error).message}`);
			return false;
		}
	}
}

export function createTmuxQueue(
	target: string,
	logger: Logger,
): {
	enqueue(text: string): Promise<void>;
} {
	const queue: Array<{
		text: string;
		resolve: () => void;
		reject: (e: Error) => void;
	}> = [];
	let running = false;

	async function drain(): Promise<void> {
		if (running || queue.length === 0) return;
		running = true;
		while (queue.length > 0) {
			const item = queue.shift();
			if (!item) break;
			try {
				await pasteToTmux(target, item.text, logger);
				item.resolve();
			} catch (e) {
				item.reject(e as Error);
			}
		}
		running = false;
	}

	return {
		enqueue(text: string): Promise<void> {
			return new Promise<void>((resolve, reject) => {
				queue.push({ text, resolve, reject });
				drain();
			});
		},
	};
}
