import { describe, expect, it } from "vitest";
import { getCapabilities } from "./capabilities.js";

describe("capabilities", () => {
	it("returns version and methods", () => {
		const caps = getCapabilities();
		expect(caps.version).toBeDefined();
		expect(caps.methods.length).toBeGreaterThan(0);
	});

	it("each method has required fields", () => {
		for (const m of getCapabilities().methods) {
			expect(m.name).toBeTruthy();
			expect(m.method).toMatch(/^(GET|POST)$/);
			expect(m.path).toBeTruthy();
			expect(m.description).toBeTruthy();
		}
	});

	it("includes backward-compat /send", () => {
		const send = getCapabilities().methods.find((m) => m.path === "/send");
		expect(send).toBeDefined();
	});
});
