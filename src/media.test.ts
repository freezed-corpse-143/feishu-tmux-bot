import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadResource, uploadFile, uploadImage } from "./media.js";

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

const TMP_DIR = path.join(import.meta.dirname, "..", "test-tmp");

beforeEach(async () => {
	await fs.mkdir(TMP_DIR, { recursive: true });
});

afterEach(async () => {
	await fs.rm(TMP_DIR, { recursive: true, force: true });
});

describe("downloadResource", () => {
	it("downloads a resource and writes to disk", async () => {
		const writeFile = vi.fn().mockResolvedValue(undefined);
		const client = {
			im: {
				messageResource: {
					get: vi.fn().mockResolvedValue({ writeFile }),
				},
			},
		};
		const logger = makeTestLogger();

		const result = await downloadResource(client, "om_001", "img_abc", "image", logger);

		expect(result).toContain("downloads");
		expect(result).toContain("om_001");
		expect(writeFile).toHaveBeenCalledOnce();
	});

	it("returns null on download failure", async () => {
		const client = {
			im: {
				messageResource: {
					get: vi.fn().mockRejectedValue(new Error("network error")),
				},
			},
		};
		const logger = makeTestLogger();

		const result = await downloadResource(client, "om_001", "img_abc", "image", logger);

		expect(result).toBeNull();
	});
});

describe("uploadImage", () => {
	it("uploads image and returns image_key", async () => {
		const tmpFile = path.join(TMP_DIR, "test.png");
		await fs.writeFile(tmpFile, "fake-png-data");

		const client = {
			im: {
				image: {
					create: vi.fn().mockResolvedValue({ image_key: "img_key_123" }),
				},
			},
		};
		const logger = makeTestLogger();

		const result = await uploadImage(client, tmpFile, logger);

		expect(result).toBe("img_key_123");
	});

	it("returns null on upload failure", async () => {
		const tmpFile = path.join(TMP_DIR, "fail.png");
		await fs.writeFile(tmpFile, "data");

		const client = {
			im: {
				image: {
					create: vi.fn().mockRejectedValue(new Error("upload error")),
				},
			},
		};
		const logger = makeTestLogger();

		const result = await uploadImage(client, tmpFile, logger);

		expect(result).toBeNull();
	});
});

describe("uploadFile", () => {
	it("uploads file and returns file_key", async () => {
		const tmpFile = path.join(TMP_DIR, "doc.pdf");
		await fs.writeFile(tmpFile, "fake-pdf-data");

		const client = {
			im: {
				file: {
					create: vi.fn().mockResolvedValue({ file_key: "file_key_456" }),
				},
			},
		};
		const logger = makeTestLogger();

		const result = await uploadFile(client, tmpFile, "pdf", "doc.pdf", logger);

		expect(result).toBe("file_key_456");
	});

	it("returns null on upload failure", async () => {
		const tmpFile = path.join(TMP_DIR, "fail.pdf");
		await fs.writeFile(tmpFile, "data");

		const client = {
			im: {
				file: {
					create: vi.fn().mockRejectedValue(new Error("upload error")),
				},
			},
		};
		const logger = makeTestLogger();

		const result = await uploadFile(client, tmpFile, "pdf", "doc.pdf", logger);

		expect(result).toBeNull();
	});
});
