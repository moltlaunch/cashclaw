import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readFile, writeFile, listDirectory } from "../src/tools/filesystem.js";
import type { ToolContext } from "../src/tools/types.js";

const ctx = {} as ToolContext;
let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cashclaw-test-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("readFile", () => {
  it("reads a file inside cwd", async () => {
    const result = await readFile.execute({ path: "package.json" }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toContain("cashclaw-agent");
  });

  it("reads a file in tmpdir", async () => {
    const filePath = path.join(tmpDir, "hello.txt");
    fs.writeFileSync(filePath, "hello world");
    const result = await readFile.execute({ path: filePath }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toBe("hello world");
  });

  it("denies access to paths outside the allowlist", async () => {
    const result = await readFile.execute({ path: "/etc/passwd" }, ctx);
    expect(result.success).toBe(false);
    expect(result.data).toContain("Access denied");
  });

  it("returns error for non-existent file", async () => {
    const result = await readFile.execute({ path: path.join(tmpDir, "nope.txt") }, ctx);
    expect(result.success).toBe(false);
    expect(result.data).toContain("File not found");
  });

  it("blocks symlink escape", async () => {
    const linkPath = path.join(tmpDir, "sneaky-link");
    try {
      fs.symlinkSync("/etc/passwd", linkPath);
    } catch {
      // symlink creation may fail on some systems — skip
      return;
    }
    const result = await readFile.execute({ path: linkPath }, ctx);
    expect(result.success).toBe(false);
    expect(result.data).toContain("Access denied");
  });
});

describe("writeFile", () => {
  it("writes a new file in tmpdir", async () => {
    const filePath = path.join(tmpDir, "output.txt");
    const result = await writeFile.execute({ path: filePath, content: "test content" }, ctx);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe("test content");
  });

  it("appends to an existing file", async () => {
    const filePath = path.join(tmpDir, "append.txt");
    fs.writeFileSync(filePath, "first ");
    const result = await writeFile.execute(
      { path: filePath, content: "second", mode: "append" },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(fs.readFileSync(filePath, "utf8")).toBe("first second");
  });

  it("creates parent directories", async () => {
    const filePath = path.join(tmpDir, "sub", "dir", "deep.txt");
    const result = await writeFile.execute({ path: filePath, content: "deep" }, ctx);
    expect(result.success).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("denies writing outside the allowlist", async () => {
    const result = await writeFile.execute({ path: "/tmp/../etc/evil.txt", content: "bad" }, ctx);
    expect(result.success).toBe(false);
    expect(result.data).toContain("Access denied");
  });
});

describe("listDirectory", () => {
  it("lists a directory inside cwd", async () => {
    const result = await listDirectory.execute({ path: "." }, ctx);
    expect(result.success).toBe(true);
    const entries = JSON.parse(result.data);
    const names = entries.map((e: { name: string }) => path.basename(e.name));
    expect(names).toContain("package.json");
  });

  it("supports recursive listing", async () => {
    // Create a nested structure in tmpdir
    const nested = path.join(tmpDir, "a", "b");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "deep.ts"), "x");

    const result = await listDirectory.execute(
      { path: tmpDir, recursive: true, pattern: "*.ts" },
      ctx,
    );
    expect(result.success).toBe(true);
    const entries = JSON.parse(result.data);
    const names = entries.map((e: { name: string }) => path.basename(e.name));
    expect(names).toContain("deep.ts");
  });

  it("rejects invalid glob patterns", async () => {
    const result = await listDirectory.execute(
      { path: tmpDir, pattern: "foo*" },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.data).toContain("Invalid pattern");
  });

  it("denies listing outside the allowlist", async () => {
    const result = await listDirectory.execute({ path: "/etc" }, ctx);
    expect(result.success).toBe(false);
    expect(result.data).toContain("Access denied");
  });
});
