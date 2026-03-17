import OpenAI from "openai";
import type { LLMClient, LLMMessage, LLMResponse } from "../types.js";

export interface OpenRouterOptions {
  apiKey: string;
  model: string;
}

export function createOpenRouterClient(opts: OpenRouterOptions): LLMClient {
  const client = new OpenAI({
    apiKey: opts.apiKey,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": "https://cashclaw.dev",
      "X-Title": "CashClaw",
    },
  });

  return {
    async chat(messages: LLMMessage[]): Promise<LLMResponse> {
      const res = await client.chat.completions.create({
        model: opts.model,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const choice = res.choices[0];
      return {
        text: choice?.message?.content ?? "",
        usage: res.usage
          ? {
              promptTokens: res.usage.prompt_tokens,
              completionTokens: res.usage.completion_tokens,
            }
          : undefined,
      };
    },
  };
}
