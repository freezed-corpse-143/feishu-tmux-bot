import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "smol-toml";
import { z } from "zod";
import type { BotConfig } from "./types.js";

const botSchema = z.object({
	name: z.string().min(1),
	app_id: z.string().min(1),
	app_secret: z.string().min(1),
	session: z.string().min(1),
	pane: z.string().default(":0.0"),
	port: z.number().int().min(1).max(65535),
	no_inject: z.boolean().optional(),
});

const configSchema = z.object({
	bots: z.array(botSchema).min(1),
});

function expandEnv(value: unknown): unknown {
	if (typeof value === "string") {
		return value.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? "");
	}
	if (Array.isArray(value)) {
		for (const item of value) expandEnv(item);
	} else if (value && typeof value === "object") {
		for (const key of Object.keys(value as Record<string, unknown>)) {
			(value as Record<string, unknown>)[key] = expandEnv((value as Record<string, unknown>)[key]);
		}
	}
	return value;
}

export function loadConfig(): BotConfig[] {
	const cfgPath = path.join(import.meta.dirname, "..", "config.toml");

	if (!existsSync(cfgPath)) {
		console.error("config.toml 不存在，请从 config.example.toml 复制并填入真实值");
		process.exit(1);
	}

	const raw = readFileSync(cfgPath, "utf-8");
	const expanded = expandEnv(parse(raw));

	const result = configSchema.safeParse(expanded);
	if (!result.success) {
		console.error("config.toml 校验失败:");
		for (const issue of result.error.issues) {
			console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
		}
		process.exit(1);
	}

	return result.data.bots;
}
