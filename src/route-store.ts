import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import type { ChatRoute, Logger, RouteStore } from "./types.js";

const MAX_ENTRIES = 1500;
const PRUNE_COUNT = 500;
const TTL_MS = 60 * 60 * 1000; // 1 hour

interface Entry {
	value: ChatRoute;
	ts: number;
}

export function makeRouteStore(dbPath: string, logger: Logger): RouteStore {
	const store = new Map<string, Entry>();
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let dirty = false;

	function load(): void {
		try {
			if (!existsSync(dbPath)) return;
			const arr: [string, Entry][] = JSON.parse(readFileSync(dbPath, "utf-8"));
			const now = Date.now();
			for (const [k, v] of arr) {
				if (now - v.ts < TTL_MS) {
					store.set(k, v);
				}
			}
			logger.log(`[db] 加载路由: ${store.size} 条`);
		} catch {
			logger.log("[db] 新建路由数据库");
		}
	}

	async function save(): Promise<void> {
		if (!dirty) return;
		dirty = false;
		try {
			const arr = [...store.entries()];
			const tmp = `${dbPath}.tmp`;
			await fs.writeFile(tmp, JSON.stringify(arr), "utf-8");
			await fs.rename(tmp, dbPath);
		} catch (e) {
			logger.error(`[db] 写入失败: ${(e as Error).message}`);
		}
	}

	function debouncedSave(): void {
		dirty = true;
		if (saveTimer) return;
		saveTimer = setTimeout(() => {
			saveTimer = null;
			save();
		}, 500);
	}

	function prune(): void {
		if (store.size <= MAX_ENTRIES) return;
		const keys = store.keys();
		for (let i = 0; i < PRUNE_COUNT; i++) {
			const next = keys.next();
			if (next.done) break;
			store.delete(next.value);
		}
	}

	load();

	return {
		put(key: string, value: ChatRoute): void {
			store.set(key, { value, ts: Date.now() });
			prune();
			debouncedSave();
		},
		get(key: string): ChatRoute | undefined {
			const entry = store.get(key);
			if (!entry) return undefined;
			if (Date.now() - entry.ts > TTL_MS) {
				store.delete(key);
				debouncedSave();
				return undefined;
			}
			return entry.value;
		},
		has(key: string): boolean {
			return this.get(key) !== undefined;
		},
	};
}
