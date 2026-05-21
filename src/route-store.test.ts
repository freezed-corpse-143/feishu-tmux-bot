import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeRouteStore } from "./route-store.js";
import type { ChatRoute } from "./types.js";

function makeTestLogger() {
	const lines: string[] = [];
	return {
		log(...args: unknown[]) {
			lines.push(`[LOG] ${args.join(" ")}`);
		},
		error(...args: unknown[]) {
			lines.push(`[ERROR] ${args.join(" ")}`);
		},
		_lines: lines,
	};
}

const TEST_DB = path.join(__dirname, "..", "logs", "test-route.db.json");
const route: ChatRoute = {
	chat_type: "group",
	chat_id: "oc_test",
	open_id: "ou_test",
};

describe("route-store", () => {
	let store: ReturnType<typeof makeRouteStore>;
	let logger: ReturnType<typeof makeTestLogger>;

	beforeEach(() => {
		try {
			fs.unlinkSync(TEST_DB);
			fs.unlinkSync(`${TEST_DB}.tmp`);
		} catch {}
		logger = makeTestLogger();
		store = makeRouteStore(TEST_DB, logger);
	});

	afterEach(async () => {
		try {
			fs.unlinkSync(TEST_DB);
			fs.unlinkSync(`${TEST_DB}.tmp`);
		} catch {}
		await new Promise((r) => setTimeout(r, 600));
	});

	it("put and get returns the value", () => {
		store.put("msg_001", route);
		expect(store.get("msg_001")).toEqual(route);
	});

	it("get returns undefined for unknown key", () => {
		expect(store.get("missing")).toBeUndefined();
	});

	it("has returns true/false", () => {
		store.put("msg_001", route);
		expect(store.has("msg_001")).toBe(true);
		expect(store.has("missing")).toBe(false);
	});

	it("loads persisted data", async () => {
		store.put("msg_001", route);
		await new Promise((r) => setTimeout(r, 600));

		const logger2 = makeTestLogger();
		const store2 = makeRouteStore(TEST_DB, logger2);
		expect(store2.get("msg_001")).toEqual(route);
	});
});
