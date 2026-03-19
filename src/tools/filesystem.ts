import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Tool, ToolResult } from "./types.js";

const MAX_FILE_SIZE = 1_048_576; // 1 MB
const MAX_ENTRIES = 500;
const MAX_DEPTH = 3;

/**
 * Returns the current allowlist of base directories.
 * Computed per-call so that changes to cwd are respected.
 */
function getAllowedBases(): string[] {
  return [fs.realpathSync(os.tmpdir()), fs.realpathSync(process.cwd())];
}

/**
 * Resolves a path and follows symlinks, then checks against the allowlist.
 * Uses fs.realpathSync to prevent symlink escapes.
 */
function resolveAndCheck(targetPath: string): { allowed: true; resolved: string } | { allowed: false; resolved: string } {
  const resolved = path.resolve(targetPath);

  // Use realpath to follow symlinks and prevent escapes.
  // Walk up to find the nearest existing ancestor for new paths.
  let realResolved: string;
  try {
    realResolved = fs.realpathSync(resolved);
  } catch {
    // Path doesn't exist yet — find the nearest existing ancestor
    let current = resolved;
    let tail: string[] = [];
    while (true) {
      const parent = path.dirname(current);
      if (parent === current) {
        // Reached filesystem root without finding an existing dir
        return { allowed: false, resolved };
      }
      tail.unshift(path.basename(current));
      current = parent;
      try {
        const realAncestor = fs.realpathSync(current);
        realResolved = path.join(realAncestor, ...tail);
        break;
      } catch {
        continue;
      }
    }
  }

  const bases = getAllowedBases();
  const allowed = bases.some(
    (base) =>
      realResolved.startsWith(base + path.sep) || realResolved === base,
  );

  return { allowed, resolved: realResolved };
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

    const check = resolveAndCheck(filePath);
    if (!check.allowed) {
      return { success: false, data: `Access denied: ${check.resolved}` };
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(check.resolved);
    } catch {
      return { success: false, data: `File not found: ${check.resolved}` };
    }

    if (stat.size > MAX_FILE_SIZE) {
      return {
        success: false,
        data: `File too large: ${stat.size} bytes (max ${MAX_FILE_SIZE})`,
      };
    }

    const content = fs.readFileSync(check.resolved, encoding as BufferEncoding);
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

    const check = resolveAndCheck(filePath);
    if (!check.allowed) {
      return { success: false, data: `Access denied: ${check.resolved}` };
    }

    fs.mkdirSync(path.dirname(check.resolved), { recursive: true });
    fs.writeFileSync(check.resolved, content, {
      flag: mode === "append" ? "a" : "w",
    });

    return {
      success: true,
      data: `Written ${content.length} bytes to ${check.resolved}`,
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
  allowedBases: string[],
): void {
  if (depth > maxDepth || entries.length >= MAX_ENTRIES) return;

  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    if (entries.length >= MAX_ENTRIES) break;

    const fullPath = path.join(dirPath, item.name);

    // Resolve symlinks and re-check allowlist on every entry during recursion
    let realPath: string;
    try {
      realPath = fs.realpathSync(fullPath);
    } catch {
      continue; // broken symlink — skip
    }

    const inBounds = allowedBases.some(
      (base) => realPath.startsWith(base + path.sep) || realPath === base,
    );
    if (!inBounds) continue;

    const stat = fs.statSync(realPath);
    const isDir = stat.isDirectory();

    if (!suffix || isDir || item.name.endsWith(suffix)) {
      entries.push({
        name: fullPath,
        type: isDir ? "dir" : "file",
        size: isDir ? 0 : stat.size,
        modified: stat.mtime.toISOString(),
      });
    }

    if (isDir && depth < maxDepth) {
      listDir(realPath, depth + 1, maxDepth, suffix, entries, allowedBases);
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
          description:
            'Filter by file extension, e.g. "*.ts" matches files ending in .ts',
        },
      },
      required: ["path"],
    },
  },
  async execute(input): Promise<ToolResult> {
    const dirPath = input.path as string;
    const recursive = (input.recursive as boolean | undefined) ?? false;
    const pattern = input.pattern as string | undefined;

    const check = resolveAndCheck(dirPath);
    if (!check.allowed) {
      return { success: false, data: `Access denied: ${check.resolved}` };
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(check.resolved);
    } catch {
      return { success: false, data: `Not a directory: ${check.resolved}` };
    }
    if (!stat.isDirectory()) {
      return { success: false, data: `Not a directory: ${check.resolved}` };
    }

    // Extract suffix from "*.ext" pattern — only support extension filters
    let suffix: string | undefined;
    if (pattern) {
      const match = pattern.match(/^\*(\.\w+)$/);
      if (match) {
        suffix = match[1];
      } else {
        return {
          success: false,
          data: `Invalid pattern "${pattern}": use "*.ext" format (e.g. "*.ts")`,
        };
      }
    }

    const maxDepth = recursive ? MAX_DEPTH : 1;
    const entries: EntryInfo[] = [];
    const allowedBases = getAllowedBases();
    listDir(check.resolved, 1, maxDepth, suffix, entries, allowedBases);

    return { success: true, data: JSON.stringify(entries, null, 2) };
  },
};
