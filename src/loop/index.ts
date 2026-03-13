import type { LLMProvider, LLMMessage, LLMResponse, ToolUseBlock, ToolResultBlock } from "../llm/types.js";
import type { CashClawConfig } from "../config.js";
import type { Task } from "../moltlaunch/types.js";
import type { ToolContext } from "../tools/types.js";
import { getToolDefinitions, executeTool } from "../tools/registry.js";
import { buildSystemPrompt } from "./prompt.js";
import { buildTaskContext } from "./context.js";

const DEFAULT_MAX_TURNS = 10;

export interface ToolCallRecord {
  name: string;
  input: Record<string, unknown>;
  result: string;
  success: boolean;
}

export interface LoopResult {
  toolCalls: ToolCallRecord[];
  reasoning: string;
  turns: number;
  usage: { inputTokens: number; outputTokens: number };
}

export async function runAgentLoop(
  llm: LLMProvider,
  task: Task,
  config: CashClawConfig,
): Promise<LoopResult> {
  const maxTurns = config.maxLoopTurns ?? DEFAULT_MAX_TURNS;
  const tools = getToolDefinitions(config);
  const toolCtx: ToolContext = { config, taskId: task.id };

  const messages: LLMMessage[] = [
    { role: "system", content: buildSystemPrompt(config, task.task) },
    { role: "user", content: buildTaskContext(task) },
  ];

  const allToolCalls: ToolCallRecord[] = [];
  const reasoningParts: string[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let turn = 0; turn < maxTurns; turn++) {
    const response: LLMResponse = await llm.chat(messages, tools);
    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;

    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        reasoningParts.push(block.text);
      }
    }

    messages.push({ role: "assistant" as const, content: response.content });

    if (response.stopReason !== "tool_use") {
      return {
        toolCalls: allToolCalls,
        reasoning: reasoningParts.join("\n"),
        turns: turn + 1,
        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
      };
    }

    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use",
    );

    const toolResults: ToolResultBlock[] = [];

    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input, toolCtx);

      allToolCalls.push({
        name: block.name,
        input: block.input,
        result: result.data,
        success: result.success,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result.data,
        is_error: !result.success,
      });
    }

    messages.push({ role: "user" as const, content: toolResults });
  }

  return {
    toolCalls: allToolCalls,
    reasoning: reasoningParts.join("\n") + "\n[max turns reached]",
    turns: maxTurns,
    usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
  };
}
