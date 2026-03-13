import { describe, it, expect, vi } from "vitest";
import { runAgentLoop } from "../src/loop/index.js";
import type { LLMProvider, LLMResponse, ToolDefinition } from "../src/llm/types.js";
import type { Task } from "../src/moltlaunch/types.js";
import type { CashClawConfig } from "../src/config.js";

// Mock the tools registry so we don't hit real APIs
vi.mock("../src/tools/registry.js", () => ({
  getToolDefinitions: () => [
    {
      name: "quote_task",
      description: "Submit a price quote",
      input_schema: { type: "object", properties: { task_id: { type: "string" }, price_eth: { type: "string" } }, required: ["task_id", "price_eth"] },
    },
    {
      name: "decline_task",
      description: "Decline a task",
      input_schema: { type: "object", properties: { task_id: { type: "string" }, reason: { type: "string" } }, required: ["task_id"] },
    },
    {
      name: "submit_work",
      description: "Submit completed work",
      input_schema: { type: "object", properties: { task_id: { type: "string" }, result: { type: "string" } }, required: ["task_id", "result"] },
    },
  ],
  executeTool: vi.fn().mockImplementation((name: string, input: Record<string, unknown>) => {
    if (name === "quote_task") {
      return Promise.resolve({ success: true, data: `Quoted task ${input.task_id}` });
    }
    if (name === "decline_task") {
      return Promise.resolve({ success: true, data: `Declined task ${input.task_id}` });
    }
    if (name === "submit_work") {
      return Promise.resolve({ success: true, data: `Submitted work for ${input.task_id}` });
    }
    return Promise.resolve({ success: false, data: `Unknown tool: ${name}` });
  }),
}));

const baseConfig: CashClawConfig = {
  agentId: "test-agent",
  llm: { provider: "anthropic", model: "test", apiKey: "test" },
  polling: { intervalMs: 30000, urgentIntervalMs: 10000 },
  pricing: { strategy: "fixed", baseRateEth: "0.005", maxRateEth: "0.05" },
  specialties: ["typescript", "react"],
  autoQuote: true,
  autoWork: true,
  maxConcurrentTasks: 3,
  maxLoopTurns: 10,
  declineKeywords: ["nsfw", "hack"],
};

const baseTask: Task = {
  id: "task-1",
  agentId: "test-agent",
  clientAddress: "0x1234",
  task: "Write a TypeScript utility function",
  status: "requested",
};

function createMockLLM(responses: LLMResponse[]): LLMProvider {
  let callIndex = 0;
  return {
    chat: vi.fn().mockImplementation(() => {
      const response = responses[callIndex];
      if (!response) throw new Error(`No mock response for call ${callIndex}`);
      callIndex++;
      return Promise.resolve(response);
    }),
  };
}

describe("runAgentLoop", () => {
  it("should handle single-turn end_turn (no tool calls)", async () => {
    const llm = createMockLLM([
      {
        content: [{ type: "text", text: "Nothing to do here." }],
        stopReason: "end_turn",
        usage: { inputTokens: 100, outputTokens: 20 },
      },
    ]);

    const result = await runAgentLoop(llm, baseTask, baseConfig);

    expect(result.turns).toBe(1);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.reasoning).toContain("Nothing to do here.");
    expect(llm.chat).toHaveBeenCalledTimes(1);
  });

  it("should execute tool calls and collect results", async () => {
    const llm = createMockLLM([
      // Turn 1: agent calls quote_task
      {
        content: [
          { type: "text", text: "Let me quote this task." },
          { type: "tool_use", id: "tc-1", name: "quote_task", input: { task_id: "task-1", price_eth: "0.005" } },
        ],
        stopReason: "tool_use",
        usage: { inputTokens: 200, outputTokens: 50 },
      },
      // Turn 2: agent is done
      {
        content: [{ type: "text", text: "Quoted the task at 0.005 ETH." }],
        stopReason: "end_turn",
        usage: { inputTokens: 350, outputTokens: 20 },
      },
    ]);

    const result = await runAgentLoop(llm, baseTask, baseConfig);

    expect(result.turns).toBe(2);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("quote_task");
    expect(result.toolCalls[0].success).toBe(true);
    expect(result.usage.inputTokens).toBe(550);
    expect(result.usage.outputTokens).toBe(70);
  });

  it("should handle decline flow", async () => {
    const llm = createMockLLM([
      {
        content: [
          { type: "text", text: "This task is outside my expertise." },
          { type: "tool_use", id: "tc-1", name: "decline_task", input: { task_id: "task-1", reason: "Not in my specialties" } },
        ],
        stopReason: "tool_use",
        usage: { inputTokens: 200, outputTokens: 30 },
      },
      {
        content: [{ type: "text", text: "Declined the task." }],
        stopReason: "end_turn",
        usage: { inputTokens: 250, outputTokens: 10 },
      },
    ]);

    const result = await runAgentLoop(llm, baseTask, baseConfig);

    expect(result.turns).toBe(2);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("decline_task");
  });

  it("should respect maxLoopTurns", async () => {
    const config = { ...baseConfig, maxLoopTurns: 2 };

    const infiniteToolResponse: LLMResponse = {
      content: [
        { type: "tool_use", id: "tc-loop", name: "quote_task", input: { task_id: "task-1", price_eth: "0.001" } },
      ],
      stopReason: "tool_use",
      usage: { inputTokens: 100, outputTokens: 20 },
    };

    const llm = createMockLLM([infiniteToolResponse, infiniteToolResponse, infiniteToolResponse]);

    const result = await runAgentLoop(llm, baseTask, config);

    expect(result.turns).toBe(2);
    expect(result.reasoning).toContain("[max turns reached]");
    expect(llm.chat).toHaveBeenCalledTimes(2);
  });

  it("should handle submit_work flow for accepted tasks", async () => {
    const task: Task = { ...baseTask, status: "accepted" };

    const llm = createMockLLM([
      {
        content: [
          { type: "text", text: "Working on the task now." },
          {
            type: "tool_use",
            id: "tc-1",
            name: "submit_work",
            input: { task_id: "task-1", result: "```ts\nexport function add(a: number, b: number) { return a + b; }\n```" },
          },
        ],
        stopReason: "tool_use",
        usage: { inputTokens: 200, outputTokens: 80 },
      },
      {
        content: [{ type: "text", text: "Work submitted." }],
        stopReason: "end_turn",
        usage: { inputTokens: 300, outputTokens: 10 },
      },
    ]);

    const result = await runAgentLoop(llm, task, baseConfig);

    expect(result.turns).toBe(2);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe("submit_work");
    expect(result.toolCalls[0].input.result).toContain("export function add");
  });

  it("should pass tools to LLM provider", async () => {
    const llm = createMockLLM([
      {
        content: [{ type: "text", text: "Done." }],
        stopReason: "end_turn",
        usage: { inputTokens: 100, outputTokens: 10 },
      },
    ]);

    await runAgentLoop(llm, baseTask, baseConfig);

    const chatCall = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const tools = chatCall[1] as ToolDefinition[];
    expect(tools).toBeDefined();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t: ToolDefinition) => t.name === "quote_task")).toBe(true);
  });

  it("should accumulate usage across turns", async () => {
    const llm = createMockLLM([
      {
        content: [{ type: "tool_use", id: "tc-1", name: "quote_task", input: { task_id: "task-1", price_eth: "0.01" } }],
        stopReason: "tool_use",
        usage: { inputTokens: 100, outputTokens: 20 },
      },
      {
        content: [{ type: "text", text: "Done." }],
        stopReason: "end_turn",
        usage: { inputTokens: 200, outputTokens: 30 },
      },
    ]);

    const result = await runAgentLoop(llm, baseTask, baseConfig);

    expect(result.usage.inputTokens).toBe(300);
    expect(result.usage.outputTokens).toBe(50);
  });
});
