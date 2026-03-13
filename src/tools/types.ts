import type { ToolDefinition } from "../llm/types.js";
import type { CashClawConfig } from "../config.js";

export interface ToolResult {
  success: boolean;
  data: string;
}

export interface ToolContext {
  config: CashClawConfig;
  taskId: string;
}

export interface Tool {
  definition: ToolDefinition;
  execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
