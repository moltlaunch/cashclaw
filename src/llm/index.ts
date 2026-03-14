import type { LLMConfig } from "../config.js";
import type {
  LLMProvider,
  LLMMessage,
  LLMResponse,
  ToolDefinition,
  ContentBlock,
  ToolResultBlock,
} from "./types.js";

export type { LLMProvider, LLMMessage, LLMResponse } from "./types.js";

// HIGH FIX: Add retry logic with exponential backoff for API calls
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry on last attempt
      if (attempt === maxRetries) break;
      
      // Check if error is retryable
      const isRetryable = isRetryableError(error);
      if (!isRetryable) throw error;
      
      // Calculate delay with exponential backoff + jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`API call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(delay)}ms:`, 
                   error instanceof Error ? error.message : String(error));
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    // Network errors, timeouts
    if (error.message.includes('fetch') || error.message.includes('timeout') || 
        error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
      return true;
    }
    
    // HTTP 5xx errors and rate limits (429)
    const statusMatch = error.message.match(/API (\d+):/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1]);
      return status >= 500 || status === 429;
    }
  }
  
  return false;
}

function createAnthropicProvider(config: LLMConfig): LLMProvider {
  return {
    async chat(messages, tools) {
      const systemMsg = messages.find((m) => m.role === "system");
      const nonSystem = messages.filter((m) => m.role !== "system");

      const body: Record<string, unknown> = {
        model: config.model,
        max_tokens: 4096,
        system: typeof systemMsg?.content === "string" ? systemMsg.content : undefined,
        messages: nonSystem.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      };

      if (tools && tools.length > 0) {
        body.tools = tools;
      }

      // HIGH FIX: Add retry logic and timeout for API reliability
      const res = await retryWithBackoff(async () => {
        return await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000), // 30s timeout
        });
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Anthropic API ${res.status}: ${err}`);
      }

      const data = (await res.json()) as {
        content: ContentBlock[];
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number };
      };

      return {
        content: data.content,
        stopReason: data.stop_reason as LLMResponse["stopReason"],
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
        },
      };
    },
  };
}

// Translate our ToolDefinition[] to OpenAI's { type: "function", function: {...} }
function toOpenAITools(tools: ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

// Translate our messages to OpenAI format
function toOpenAIMessages(
  messages: LLMMessage[],
): unknown[] {
  return messages.map((m) => {
    // System/simple text messages
    if (typeof m.content === "string") {
      return { role: m.role, content: m.content };
    }

    // Assistant message with tool_use blocks
    if (m.role === "assistant" && Array.isArray(m.content)) {
      const textParts = m.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("");

      const toolCalls = m.content
        .filter((b): b is { type: "tool_use"; id: string; name: string; input: Record<string, unknown> } => b.type === "tool_use")
        .map((b) => ({
          id: b.id,
          type: "function",
          function: {
            name: b.name,
            arguments: JSON.stringify(b.input),
          },
        }));

      return {
        role: "assistant",
        content: textParts || null,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    }

    // User message with tool_result blocks
    if (m.role === "user" && Array.isArray(m.content)) {
      const results = m.content as ToolResultBlock[];
      // OpenAI expects individual "tool" messages for each result
      return results.map((r) => ({
        role: "tool",
        tool_call_id: r.tool_use_id,
        content: r.content,
      }));
    }

    return { role: m.role, content: m.content };
  }).flat();
}

interface OpenAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

function createOpenAICompatibleProvider(
  config: LLMConfig,
  baseUrl: string,
): LLMProvider {
  return {
    async chat(messages, tools) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      };

      if (baseUrl.includes("openrouter")) {
        headers["HTTP-Referer"] = "https://cashclaw.dev";
        headers["X-Title"] = "CashClaw";
      }

      const body: Record<string, unknown> = {
        model: config.model,
        max_completion_tokens: 4096,
        messages: toOpenAIMessages(messages),
      };

      if (tools && tools.length > 0) {
        body.tools = toOpenAITools(tools);
      }

      // HIGH FIX: Add retry logic and timeout for API reliability
      const res = await retryWithBackoff(async () => {
        return await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(30000), // 30s timeout
        });
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`LLM API ${res.status}: ${err}`);
      }

      const data = (await res.json()) as {
        choices: Array<{
          message: {
            content: string | null;
            tool_calls?: OpenAIToolCall[];
          };
          finish_reason: string;
        }>;
        usage: { prompt_tokens: number; completion_tokens: number };
      };

      const choice = data.choices[0];
      const content: ContentBlock[] = [];

      if (choice.message.content) {
        content.push({ type: "text", text: choice.message.content });
      }

      if (choice.message.tool_calls) {
        for (const tc of choice.message.tool_calls) {
          let input: Record<string, unknown>;
          try {
            input = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          } catch {
            input = { _raw: tc.function.arguments, _error: "malformed JSON from LLM" };
          }
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
      }

      // Map finish_reason to our stopReason
      const stopReasonMap: Record<string, LLMResponse["stopReason"]> = {
        stop: "end_turn",
        tool_calls: "tool_use",
        length: "max_tokens",
      };

      return {
        content,
        stopReason: stopReasonMap[choice.finish_reason] ?? "end_turn",
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
        },
      };
    },
  };
}

export function createLLMProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case "anthropic":
      return createAnthropicProvider(config);
    case "openai":
      return createOpenAICompatibleProvider(
        config,
        (config as any).baseUrl || "https://api.openai.com/v1",
      );
    case "openrouter":
      return createOpenAICompatibleProvider(
        config,
        (config as any).baseUrl || "https://openrouter.ai/api/v1",
      );
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
