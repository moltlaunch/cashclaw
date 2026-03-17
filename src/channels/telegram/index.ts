import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import type { Channel } from "../types.js";
import type { IncomingMessage, OutgoingMessage } from "../../core/types.js";
import { registerHandlers } from "./handlers.js";

/**
 * Telegram channel adapter.
 *
 * Wraps a grammY Bot and exposes the unified Channel interface
 * so the core agent can drive it without knowing Telegram specifics.
 */
export class TelegramChannel implements Channel {
  name = "telegram";
  requiredConfig = ["token"];

  private bot: Bot | null = null;
  private handler: ((msg: IncomingMessage) => Promise<OutgoingMessage>) | null = null;
  private ownerChatId: number | null = null;

  async start(config: Record<string, string>): Promise<void> {
    this.bot = new Bot(config.token);
    this.bot.api.config.use(autoRetry());
    this.ownerChatId = config.owner_chat_id ? parseInt(config.owner_chat_id, 10) : null;

    if (!this.handler) {
      throw new Error("TelegramChannel: call onMessage() before start()");
    }

    registerHandlers(this.bot, this.handler, this.ownerChatId);
    this.bot.start();
  }

  async stop(): Promise<void> {
    await this.bot?.stop();
  }

  async send(userId: string, message: OutgoingMessage): Promise<void> {
    await this.bot?.api.sendMessage(parseInt(userId, 10), message.text);
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<OutgoingMessage>): void {
    this.handler = handler;
  }
}
