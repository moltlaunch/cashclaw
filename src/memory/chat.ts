import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getConfigDir } from "../config.js";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

const MAX_MESSAGES = 100;

function getChatPath(): string {
  return path.join(getConfigDir(), "chat.json");
}

export function loadChat(): ChatMessage[] {
  const p = getChatPath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ChatMessage =>
        typeof e === "object" && e !== null &&
        typeof (e as ChatMessage).role === "string" &&
        typeof (e as ChatMessage).content === "string",
    );
  } catch {
    return [];
  }
}

export function appendChat(message: ChatMessage): void {
  const messages = loadChat();
  messages.push(message);

  const trimmed = messages.slice(-MAX_MESSAGES);

  const p = getChatPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2));
  fs.renameSync(tmp, p);
}

export function clearChat(): void {
  const p = getChatPath();
  if (fs.existsSync(p)) {
    const tmp = `${p}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(tmp, "[]");
    fs.renameSync(tmp, p);
  }
}
