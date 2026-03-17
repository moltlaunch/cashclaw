/** A single message in a chat conversation. */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** A chunk emitted during streaming. */
export interface LLMStreamChunk {
  delta: string;
  done: boolean;
}

/** A complete (non-streaming) LLM response. */
export interface LLMResponse {
  text: string;
  usage?: { promptTokens: number; completionTokens: number };
}

/** Minimal client interface used by the router. */
export interface LLMClient {
  chat(messages: LLMMessage[]): Promise<LLMResponse>;
}
