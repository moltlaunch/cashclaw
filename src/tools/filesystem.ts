import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Tool, ToolResult } from "./types.js";

const MAX_FILE_SIZE = 1_048_576; // 1 MB
const MAX_ENTRIES = 500;
const MAX_DEPTH = 3;

// Cached once at module load to avoid repeated syscalls on every security check
const ALLOWED_BASES = [os.tmpdir(), process.cwd()];

function isPathAllowed(resolvedPath: string): boolean {
  return ALLOWED_BASES.some(
    (base) =>
      resolvedPath.startsWith(base + path.sep) || resolvedPath === base,
  );
}

export const readFile: Tool = {
  definition: {
    name: "read_file",
    description:
      "Read a file and return its contents. Returns UTF-8 text by default, or base64 for binary files.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path to read" },
        encoding: {
          type: "string",
          enum: ["utf8", "base64"],
          description: "File encoding (default: utf8)",
        },
      },
      required: ["path"],
    },
  },
  async execute(input): Promise<ToolResult> {
    const filePath = input.path as string;
    const encoding = (input.encoding as string | undefined) ?? "utf8";

    const resolved = path.resolve(filePath);

    if (!isPathAllowed(resolved)) {
      return { success: false, data: `Access denied: ${resolved}` };
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      return { success: false, data: `File not found: ${resolved}` };
    }

    if (stat.size > MAX_FILE_SIZE) {
      return {
        success: false,
        data: `File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE})`,
      };
    }

    const content = fs.readFileSync(resolved, encoding as BufferEncoding);
    return { success: true, data: content };
  },
};

export const writeFile: Tool = {
  definition: {
    name: "write_file",
    description:
      "Write content to a file, creating parent directories as needed.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "File path to write" },
        content: { type: "string", description: "Content to write" },
        mode: {
          type: "string",
          enum: ["overwrite", "append"],
          description: "Write mode (default: overwrite)",
        },
      },
      required: ["path", "content"],
    },
  },
  async execute(input): Promise<ToolResult> {
    const filePath = input.path as string;
    const content = input.content as string;
    const mode = (input.mode as string | undefined) ?? "overwrite";

    const resolved = path.resolve(filePath);

    if (!isPathAllowed(resolved)) {
      return { success: false, data: `Access denied: ${resolved}` };
    }

    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, content, { flag: mode === "append" ? "a" : "w" });

    return {
      success: true,
      data: `Written ${content.length} bytes to ${resolved}`,
    };
  },
};

interface EntryInfo {
  name: string;
  type: "file" | "dir";
  size: number;
  modified: string;
}

function listDir(
  dirPath: string,
  depth: number,
  maxDepth: number,
  suffix: string | undefined,
  entries: EntryInfo[],
): void {
  if (depth > maxDepth || entries.length >= MAX_ENTRIES) return;

  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    if (entries.length >= MAX_ENTRIES) break;

    const isDir = item.isDirectory();
    const fullPath = path.join(dirPath, item.name);
    const stat = fs.statSync(fullPath);

    if (!suffix || isDir || item.name.endsWith(suffix)) {
      entries.push({
        name: fullPath,
        type: isDir ? "dir" : "file",
        size: isDir ? 0 : stat.size,
        modified: stat.mtime.toISOString(),
      });
    }

    if (isDir && depth < maxDepth) {
      listDir(fullPath, depth + 1, maxDepth, suffix, entries);
    }
  }
}

export const listDirectory: Tool = {
  definition: {
    name: "list_directory",
    description:
      "List files and directories. Returns a JSON array with name, type, size, and modified date.",
    input_schema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Directory path to list" },
        recursive: {
          type: "boolean",
          description: "Recurse into subdirectories (max depth 3)",
        },
        pattern: {
          type: "string",
          description: 'Filter by extension pattern, e.g. "*.ts"',
        },
      },
      required: ["path"],
    },
  },
  async execute(input): Promise<ToolResult> {
    const dirPath = input.path as string;
    const recursive = (input.recursive as boolean | undefined) ?? false;
    const pattern = input.pattern as string | undefined;

    const resolved = path.resolve(dirPath);

    if (!isPathAllowed(resolved)) {
      return { success: false, data: `Access denied: ${resolved}` };
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolved);
    } catch {
      return { success: false, data: `Not a directory: ${resolved}` };
    }
    if (!stat.isDirectory()) {
      return { success: false, data: `Not a directory: ${resolved}` };
    }

    // Pre-compute pattern suffix once rather than inside the loop
    const suffix = pattern ? pattern.replace(/^\*/, "") : undefined;
    const maxDepth = recursive ? MAX_DEPTH : 1;

    const entries: EntryInfo[] = [];
    listDir(resolved, 1, maxDepth, suffix, entries);

    return { success: true, data: JSON.stringify(entries, null, 2) };
  },
};
