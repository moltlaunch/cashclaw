import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Tool, ToolResult } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".betsy");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.yaml");

// ---------------------------------------------------------------------------
// Minimal YAML helpers (no external dependency)
//
// The config file uses a flat key: value structure, which is simple enough to
// parse and serialise without pulling in a full YAML library.
// ---------------------------------------------------------------------------

type ConfigMap = Record<string, string>;

function parseYaml(text: string): ConfigMap {
  const map: ConfigMap = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    map[key] = value;
  }
  return map;
}

function serializeYaml(map: ConfigMap): string {
  return Object.entries(map)
    .map(([k, v]) => {
      // Quote values that contain special YAML characters
      const needsQuoting = /[:#\[\]{},>|&!%@`]/.test(v) || v === "";
      const quoted = needsQuoting ? `"${v.replace(/"/g, '\\"')}"` : v;
      return `${k}: ${quoted}`;
    })
    .join("\n") + "\n";
}

function readConfig(): ConfigMap {
  try {
    return parseYaml(fs.readFileSync(CONFIG_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(map: ConfigMap): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, serializeYaml(map));
}

// ---------------------------------------------------------------------------
// Tool actions
// ---------------------------------------------------------------------------

function handleGet(params: Record<string, unknown>): ToolResult {
  const key = params.key;
  if (typeof key !== "string" || !key.trim()) {
    return { success: false, output: "Missing required parameter: key", error: "missing_param" };
  }
  const config = readConfig();
  const value = config[key.trim()];
  if (value === undefined) {
    return { success: true, output: `Key "${key.trim()}" is not set.` };
  }
  return { success: true, output: `${key.trim()}: ${value}` };
}

function handleSet(params: Record<string, unknown>): ToolResult {
  const key = params.key;
  if (typeof key !== "string" || !key.trim()) {
    return { success: false, output: "Missing required parameter: key", error: "missing_param" };
  }
  const value = params.value;
  if (value === undefined || value === null) {
    return { success: false, output: "Missing required parameter: value", error: "missing_param" };
  }
  const config = readConfig();
  config[key.trim()] = String(value);
  writeConfig(config);
  return { success: true, output: `Set ${key.trim()} = ${String(value)}` };
}

function handleList(): ToolResult {
  const config = readConfig();
  const keys = Object.keys(config);
  if (keys.length === 0) {
    return { success: true, output: "Config is empty." };
  }
  const lines = keys.map((k) => `- ${k}: ${config[k]}`);
  return { success: true, output: `${keys.length} key(s):\n${lines.join("\n")}` };
}

export const selfConfigTool: Tool = {
  name: "self_config",
  description:
    "Read or write Betsy's own configuration stored in ~/.betsy/config.yaml. " +
    "action=get retrieves a single key, action=set writes a key-value pair, " +
    "action=list shows all configuration entries.",
  parameters: [
    { name: "action", type: "string", description: "One of: get, set, list", required: true },
    { name: "key", type: "string", description: "Config key (required for get/set)" },
    { name: "value", type: "string", description: "Config value (required for set)" },
  ],

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const action = params.action;
    if (typeof action !== "string" || !action.trim()) {
      return { success: false, output: "Missing required parameter: action", error: "missing_param" };
    }

    switch (action.trim()) {
      case "get":
        return handleGet(params);
      case "set":
        return handleSet(params);
      case "list":
        return handleList();
      default:
        return {
          success: false,
          output: `Unknown action: ${action}. Use get, set, or list.`,
          error: "invalid_action",
        };
    }
  },
};
