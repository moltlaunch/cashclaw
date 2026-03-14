/**
 * claude CLI ベースの LLM プロバイダー。
 *
 * ANTHROPIC_API_KEY を使わず、ローカルの `claude` CLI（OAuth認証済み）を
 * サブプロセスとして起動して LLM 推論を行う。
 *
 * ツール使用は ReAct スタイルで実装する:
 *   - システムプロンプトにツール定義と JSON 出力形式を追加
 *   - モデルがツール呼び出しを JSON で出力 → パース → 実行 → 結果を追加して再呼び出し
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  ToolDefinition,
  ContentBlock,
  ToolUseBlock,
} from "./types.js";

const execFileAsync = promisify(execFile);

const CLAUDE_BIN = process.env.CLAUDE_BIN ?? "claude";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const CLI_TIMEOUT_MS = 120_000;

// ──────────────────────────────────────────────────────────────
// Prompt building
// ──────────────────────────────────────────────────────────────

function buildToolsInstructions(tools: ToolDefinition[]): string {
  if (tools.length === 0) return "";

  const toolsJson = JSON.stringify(
    tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
    null,
    2,
  );

  return `
## Available Tools

You have access to the following tools. To use a tool, output a JSON block on its own line:

\`\`\`json
{"action":"tool_use","name":"<tool_name>","input":{<parameters>}}
\`\`\`

When you are finished (no more tool calls needed), output:

\`\`\`json
{"action":"end_turn"}
\`\`\`

Then provide your final response as plain text after the JSON block.

Tools:
\`\`\`json
${toolsJson}
\`\`\`
`;
}

function serializeMessages(messages: LLMMessage[], tools: ToolDefinition[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue; // handled separately as --system

    const prefix = msg.role === "user" ? "User" : "Assistant";

    if (typeof msg.content === "string") {
      parts.push(`[${prefix}]: ${msg.content}`);
    } else if (Array.isArray(msg.content)) {
      const blocks = msg.content as ContentBlock[];
      const textBlocks = blocks.filter((b) => b.type === "text").map((b) => (b as { type: "text"; text: string }).text);
      const toolBlocks = blocks.filter((b) => b.type === "tool_use") as ToolUseBlock[];

      if (textBlocks.length > 0) {
        parts.push(`[${prefix}]: ${textBlocks.join("\n")}`);
      }
      for (const tb of toolBlocks) {
        parts.push(`[${prefix} tool_use]: ${JSON.stringify({ name: tb.name, input: tb.input })}`);
      }
    }
  }

  if (tools.length > 0) {
    parts.push(buildToolsInstructions(tools));
    parts.push(
      "[User]: Continue. If you need to use a tool, output the JSON block. Otherwise output end_turn JSON and your final response.",
    );
  }

  return parts.join("\n\n");
}

function extractSystem(messages: LLMMessage[]): string {
  const sysMsg = messages.find((m) => m.role === "system");
  if (!sysMsg || typeof sysMsg.content !== "string") return "";
  return sysMsg.content;
}

// ──────────────────────────────────────────────────────────────
// Response parsing
// ──────────────────────────────────────────────────────────────

interface ToolUseAction {
  action: "tool_use";
  name: string;
  input: Record<string, unknown>;
}

interface EndTurnAction {
  action: "end_turn";
}

type ParsedAction = ToolUseAction | EndTurnAction;

function parseActions(text: string): { actions: ParsedAction[]; plainText: string } {
  const actions: ParsedAction[] = [];
  let plainText = text;

  // JSON ブロックを抽出（```json ... ``` または 行頭の { } ）
  const jsonBlockRe = /```json\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = jsonBlockRe.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim()) as ParsedAction;
      if (parsed.action === "tool_use" || parsed.action === "end_turn") {
        actions.push(parsed);
        plainText = plainText.replace(match[0], "").trim();
      }
    } catch {
      // パース失敗は無視
    }
  }

  // インライン JSON も試みる（```なし）
  if (actions.length === 0) {
    const inlineRe = /\{[^{}]*"action"\s*:\s*"(tool_use|end_turn)"[^{}]*\}/g;
    while ((match = inlineRe.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[0]) as ParsedAction;
        actions.push(parsed);
        plainText = plainText.replace(match[0], "").trim();
      } catch {
        // 無視
      }
    }
  }

  return { actions, plainText };
}

function buildResponse(text: string, hasTools: boolean): LLMResponse {
  const { actions, plainText } = hasTools ? parseActions(text) : { actions: [], plainText: text };

  const content: ContentBlock[] = [];
  let stopReason: LLMResponse["stopReason"] = "end_turn";
  let toolUseCounter = 0;

  for (const action of actions) {
    if (action.action === "tool_use") {
      content.push({
        type: "tool_use",
        id: `cli_tool_${Date.now()}_${toolUseCounter++}`,
        name: action.name,
        input: action.input,
      });
      stopReason = "tool_use";
    }
  }

  if (plainText.trim()) {
    content.push({ type: "text", text: plainText.trim() });
  }

  if (content.length === 0) {
    content.push({ type: "text", text: text.trim() || "(empty response)" });
  }

  return {
    content,
    stopReason,
    // claude CLI はトークン数を返さないため推定値を使う
    usage: {
      inputTokens: 0,
      outputTokens: 0,
    },
  };
}

// ──────────────────────────────────────────────────────────────
// Provider factory
// ──────────────────────────────────────────────────────────────

export function createClaudeCliProvider(model?: string): LLMProvider {
  const resolvedModel = model ?? DEFAULT_MODEL;

  return {
    async chat(messages, tools = []) {
      const systemPrompt = extractSystem(messages);
      const userPrompt = serializeMessages(messages, tools);

      const args: string[] = [
        "--print",
        "--output-format",
        "text",
        "--model",
        resolvedModel,
      ];

      if (systemPrompt) {
        args.push("--system", systemPrompt);
      }

      args.push("--", userPrompt);

      const { stdout } = await execFileAsync(CLAUDE_BIN, args, {
        timeout: CLI_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024, // 10MB
        env: { ...process.env },
      });

      return buildResponse(stdout, tools.length > 0);
    },
  };
}
