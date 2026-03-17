import type { Bot, Context } from "grammy";
import type { IncomingMessage, OutgoingMessage } from "../../core/types.js";
import { sendVoiceResponse } from "./voice.js";
import { sendVideoNote } from "./video.js";
import { sendSelfie } from "./selfies.js";

type MessageHandler = (msg: IncomingMessage) => Promise<OutgoingMessage>;

/** Extract the text body after a slash-command prefix. */
function commandBody(ctx: Context, command: string): string {
  const raw = ctx.message?.text ?? "";
  return raw.replace(new RegExp(`^/${command}\\s*`), "");
}

/** Convert a grammY Context into a channel-neutral IncomingMessage. */
function toIncoming(ctx: Context, text: string): IncomingMessage {
  return {
    channelName: "telegram",
    userId: String(ctx.chat?.id ?? ctx.from?.id ?? "unknown"),
    text,
    timestamp: Date.now(),
    metadata: {
      messageId: ctx.message?.message_id,
      fromUsername: ctx.from?.username,
      firstName: ctx.from?.first_name,
    },
  };
}

/** Deliver an OutgoingMessage through the appropriate Telegram media type. */
async function deliver(ctx: Context, response: OutgoingMessage): Promise<void> {
  const mode = response.mode ?? "text";

  if (mode === "voice") {
    const sent = await sendVoiceResponse(ctx as never, response.text, {});
    if (!sent) await ctx.reply(response.text);
    return;
  }

  if (mode === "video") {
    const sent = await sendVideoNote(ctx as never, response.text, {}, "", "");
    if (!sent) await ctx.reply(response.text);
    return;
  }

  if (mode === "selfie") {
    const sent = await sendSelfie(ctx as never, response.text, "", "");
    if (!sent) await ctx.reply(response.text);
    return;
  }

  await ctx.reply(response.text);
}

/** Register all command and message handlers on the bot. */
export function registerHandlers(
  bot: Bot,
  handler: MessageHandler,
  ownerChatId: number | null,
): void {
  // --- Owner-only filter (when configured) ---
  if (ownerChatId) {
    bot.use(async (ctx, next) => {
      const chatId = ctx.chat?.id;
      if (chatId && chatId !== ownerChatId) {
        await ctx.reply("This bot is private.");
        return;
      }
      await next();
    });
  }

  // /start
  bot.command("start", async (ctx) => {
    const response = await handler(toIncoming(ctx, "/start"));
    await deliver(ctx, response);
  });

  // /status
  bot.command("status", async (ctx) => {
    const response = await handler(toIncoming(ctx, "/status"));
    await deliver(ctx, response);
  });

  // /help
  bot.command("help", async (ctx) => {
    const response = await handler(toIncoming(ctx, "/help"));
    await deliver(ctx, response);
  });

  // /voice <text>
  bot.command("voice", async (ctx) => {
    const body = commandBody(ctx, "voice");
    if (!body) {
      await ctx.reply("Usage: /voice <text to speak>");
      return;
    }
    const response = await handler(toIncoming(ctx, body));
    await deliver(ctx, { ...response, mode: "voice" });
  });

  // /video <text>
  bot.command("video", async (ctx) => {
    const body = commandBody(ctx, "video");
    if (!body) {
      await ctx.reply("Usage: /video <text for lip-sync>");
      return;
    }
    const response = await handler(toIncoming(ctx, body));
    await deliver(ctx, { ...response, mode: "video" });
  });

  // /selfie <prompt>
  bot.command("selfie", async (ctx) => {
    const body = commandBody(ctx, "selfie");
    if (!body) {
      await ctx.reply("Usage: /selfie <description>");
      return;
    }
    const response = await handler(toIncoming(ctx, body));
    await deliver(ctx, { ...response, mode: "selfie" });
  });

  // /study
  bot.command("study", async (ctx) => {
    const response = await handler(toIncoming(ctx, "/study"));
    await deliver(ctx, response);
  });

  // Plain text messages
  bot.on("message:text", async (ctx) => {
    const userText = ctx.message.text;
    if (userText.startsWith("/")) return;

    const response = await handler(toIncoming(ctx, userText));
    await deliver(ctx, response);
  });
}
