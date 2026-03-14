import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLLMProvider } from "../src/llm/index.js";
import type { LLMConfig, LLMMessage } from "../src/llm/index.js";

// Mock global fetch
globalThis.fetch = vi.fn();

describe("LLM Providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Ollama Provider", () => {
    const ollamaConfig: LLMConfig = {
      provider: "ollama",
      model: "llama3",
      apiKey: "", // No API key for local Ollama
    };

    it("should use localhost:11434 as base URL", async () => {
      const provider = createLLMProvider(ollamaConfig);
      
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Hello" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "Hi" }
      ];

      await provider.chat(messages);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[0]).toBe("http://localhost:11434/v1/chat/completions");
    });

    it("should not require API key for local Ollama", async () => {
      const provider = createLLMProvider(ollamaConfig);
      
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Test" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "Test" }
      ];

      await provider.chat(messages);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = fetchCall[1].headers as Record<string, string>;
      // Ollama doesn't require Authorization header for local instance
      expect(headers.Authorization).toBeUndefined();
    });

    it("should use provided API key if given", async () => {
      const configWithKey: LLMConfig = {
        ...ollamaConfig,
        apiKey: "ollama_key_123",
      };
      const provider = createLLMProvider(configWithKey);
      
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Test" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "Test" }
      ];

      await provider.chat(messages);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = fetchCall[1].headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer ollama_key_123");
    });

    it("should pass model from config", async () => {
      const provider = createLLMProvider(ollamaConfig);
      
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Test" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "Test" }
      ];

      await provider.chat(messages);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.model).toBe("llama3");
    });

    it("should support custom Ollama models like qwen:30b", async () => {
      const configWithQwen: LLMConfig = {
        provider: "ollama",
        model: "qwen:30b",
        apiKey: "",
      };
      const provider = createLLMProvider(configWithQwen);
      
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "Test" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "Test" }
      ];

      await provider.chat(messages);

      const fetchCall = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const body = JSON.parse(fetchCall[1].body as string);
      expect(body.model).toBe("qwen:30b");
    });

    it("should handle tool calls from Ollama response", async () => {
      const provider = createLLMProvider(ollamaConfig);
      
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: { name: "quote_task", arguments: JSON.stringify({ task_id: "task-1", price_eth: "0.01" }) }
                }
              ]
            },
            finish_reason: "tool_calls"
          }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "Quote this task" }
      ];

      const response = await provider.chat(messages);

      expect(response.content).toHaveLength(1);
      expect(response.content[0]).toEqual({
        type: "tool_use",
        id: "call_123",
        name: "quote_task",
        input: { task_id: "task-1", price_eth: "0.01" }
      });
      expect(response.stopReason).toBe("tool_use");
    });

    it("should throw error on API failure", async () => {
      const provider = createLLMProvider(ollamaConfig);
      
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal Server Error"),
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "Hi" }
      ];

      await expect(provider.chat(messages)).rejects.toThrow("Ollama API 500: Internal Server Error");
    });

    it("should handle non-JSON error responses", async () => {
      const provider = createLLMProvider(ollamaConfig);
      
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not Found"),
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "Hi" }
      ];

      await expect(provider.chat(messages)).rejects.toThrow("Ollama API 404: Not Found");
    });

    it("should provide helpful error for unsupported tool calling", async () => {
      const provider = createLLMProvider(ollamaConfig);
      
      (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("tool calling not supported"),
      });

      const messages: LLMMessage[] = [
        { role: "user", content: "Hi" }
      ];

      const tools = [{ name: "test", description: "test", input_schema: { type: "object" } }];
      
      await expect(provider.chat(messages, tools)).rejects.toThrow(
        "Ollama tool calling not supported for model llama3"
      );
    });
  });

  describe("Provider Factory", () => {
    it("should create Anthropic provider", () => {
      const config: LLMConfig = {
        provider: "anthropic",
        model: "claude-sonnet-4-20250514",
        apiKey: "sk-ant-...",
      };
      
      // Should not throw
      expect(() => createLLMProvider(config)).not.toThrow();
    });

    it("should create OpenAI provider", () => {
      const config: LLMConfig = {
        provider: "openai",
        model: "gpt-4o",
        apiKey: "sk-...",
      };
      
      expect(() => createLLMProvider(config)).not.toThrow();
    });

    it("should create OpenRouter provider", () => {
      const config: LLMConfig = {
        provider: "openrouter",
        model: "openai/gpt-4o",
        apiKey: "sk-or-...",
      };
      
      expect(() => createLLMProvider(config)).not.toThrow();
    });

    it("should throw on unknown provider", () => {
      const config = {
        provider: "unknown" as LLMConfig["provider"],
        model: "test",
        apiKey: "test",
      };
      
      expect(() => createLLMProvider(config)).toThrow("Unknown LLM provider: unknown");
    });
  });
});
