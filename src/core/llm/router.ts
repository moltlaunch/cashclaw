import type { LLMClient } from "./types.js";
import { createOpenRouterClient } from "./providers/openrouter.js";

export interface LLMRouterConfig {
  provider: string;
  api_key: string;
  fast_model: string;
  strong_model: string;
}

export class LLMRouter {
  private readonly config: LLMRouterConfig;
  private fastClient: LLMClient | undefined;
  private strongClient: LLMClient | undefined;

  constructor(config: LLMRouterConfig) {
    this.config = config;
  }

  fast(): LLMClient {
    if (!this.fastClient) {
      this.fastClient = this.createClient(this.config.fast_model);
    }
    return this.fastClient;
  }

  strong(): LLMClient {
    if (!this.strongClient) {
      this.strongClient = this.createClient(this.config.strong_model);
    }
    return this.strongClient;
  }

  private createClient(model: string): LLMClient {
    switch (this.config.provider) {
      case "openrouter":
        return createOpenRouterClient({ apiKey: this.config.api_key, model });
      default:
        throw new Error(`Unknown LLM provider: ${this.config.provider}`);
    }
  }
}
