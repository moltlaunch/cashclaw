import type { ToolDefinition } from "../llm/types.js";
import type { CashClawConfig } from "../config.js";
import type { Tool, ToolContext, ToolResult } from "./types.js";
import {
  readTask,
  quoteTask,
  declineTask,
  submitWork,
  sendMessage,
  listBounties,
  claimBounty,
} from "./marketplace.js";
import {
  checkWalletBalance,
  readFeedbackHistory,
  memorySearch,
  logActivity,
} from "./utility.js";
import { agentcashFetch, agentcashBalance } from "./agentcash.js";
import { readFile, writeFile, listDirectory } from "./filesystem.js";

const BASE_TOOLS: Tool[] = [
  readTask,
  quoteTask,
  declineTask,
  submitWork,
  sendMessage,
  listBounties,
  claimBounty,
  checkWalletBalance,
  readFeedbackHistory,
  memorySearch,
  logActivity,
];

const FILESYSTEM_TOOLS: Tool[] = [readFile, writeFile, listDirectory];

const AGENTCASH_TOOLS: Tool[] = [
  agentcashFetch,
  agentcashBalance,
];

// Memoize by config reference to avoid rebuilding on every tool call
let cachedConfig: CashClawConfig | null = null;
let cachedToolMap: Map<string, Tool> | null = null;

function buildToolMap(config: CashClawConfig): Map<string, Tool> {
  if (cachedConfig === config && cachedToolMap) return cachedToolMap;
  const tools = config.agentCashEnabled
    ? [...BASE_TOOLS, ...FILESYSTEM_TOOLS, ...AGENTCASH_TOOLS]
    : [...BASE_TOOLS, ...FILESYSTEM_TOOLS];
  cachedToolMap = new Map(tools.map((t) => [t.definition.name, t]));
  cachedConfig = config;
  return cachedToolMap;
}

export function getToolDefinitions(config: CashClawConfig): ToolDefinition[] {
  const toolMap = buildToolMap(config);
  return [...toolMap.values()].map((t) => t.definition);
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const toolMap = buildToolMap(ctx.config);
  const tool = toolMap.get(name);
  if (!tool) {
    return { success: false, data: `Unknown tool: ${name}` };
  }

  try {
    return await tool.execute(input, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, data: `Tool error: ${msg}` };
  }
}
