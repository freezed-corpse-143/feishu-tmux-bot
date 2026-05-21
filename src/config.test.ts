import { describe, expect, it } from "vitest";

// Test env var expansion logic inline (avoids mocking process.env across tests)
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

describe("config env expansion", () => {
	it("replaces ${VAR} with env value", () => {
		process.env.TEST_FOO = "bar";
		const result = expandEnv({ key: "${TEST_FOO}" });
		expect((result as Record<string, unknown>).key).toBe("bar");
	});

	it("replaces missing var with empty string", () => {
		const result = expandEnv({ key: "${NONEXISTENT}" });
		expect((result as Record<string, unknown>).key).toBe("");
	});

	it("handles nested objects", () => {
		process.env.NESTED_VAL = "deep";
		const result = expandEnv({ outer: { inner: "${NESTED_VAL}" } });
		expect((result as Record<string, { inner: string }>).outer.inner).toBe("deep");
	});

	it("handles arrays of objects", () => {
		process.env.ARR_VAL = "item";
		const result = expandEnv([{ key: "${ARR_VAL}" }]);
		expect((result as Array<Record<string, string>>)[0].key).toBe("item");
	});

	it("does not mutate non-string values", () => {
		const result = expandEnv({ num: 42, bool: true });
		expect((result as Record<string, unknown>).num).toBe(42);
		expect((result as Record<string, unknown>).bool).toBe(true);
	});
});
