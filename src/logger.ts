import { existsSync, mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { Logger } from "./types.js";

const LOG_DIR = path.join(import.meta.dirname, "..", "logs");

export function ts(): string {
	return new Date().toISOString();
}

export function ensureLogDir(): void {
	if (!existsSync(LOG_DIR)) {
		mkdirSync(LOG_DIR, { recursive: true });
	}
}

export function makeLogger(name: string): Logger {
	const logFile = path.join(LOG_DIR, `${name}.log`);

	function write(level: string, args: unknown[]): void {
		const line = `[${ts()}] ${level ? `[${level}] ` : ""}${args.join(" ")}`;
		const prefix = `[${name}]`;
		(level === "ERROR" ? process.stderr : process.stdout).write(`${prefix} ${line}\n`);
		fs.appendFile(logFile, `${line}\n`, "utf-8").catch(() => {});
	}

	return {
		log(...args: unknown[]) {
			write("", args);
		},
		error(...args: unknown[]) {
			write("ERROR", args);
		},
	};
}
