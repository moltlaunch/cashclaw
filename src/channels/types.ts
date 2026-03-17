import type { IncomingMessage, OutgoingMessage } from "../core/types.js";

export interface Channel {
  name: string;
  requiredConfig: string[];
  start(config: Record<string, string>): Promise<void>;
  stop(): Promise<void>;
  send(userId: string, message: OutgoingMessage): Promise<void>;
  onMessage(handler: (msg: IncomingMessage) => Promise<OutgoingMessage>): void;
}
