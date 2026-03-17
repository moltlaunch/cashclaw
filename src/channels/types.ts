import type { IncomingMessage, OutgoingMessage } from "../core/types.js";

/** Common interface that every channel adapter must implement. */
export interface Channel {
  /** Unique channel identifier (e.g. "telegram", "discord"). */
  name: string;

  /** Config keys the channel needs at startup. */
  requiredConfig: string[];

  /** Connect to the external service and begin listening. */
  start(config: Record<string, string>): Promise<void>;

  /** Gracefully shut down the channel. */
  stop(): Promise<void>;

  /** Push a message to a specific user. */
  send(userId: string, message: OutgoingMessage): Promise<void>;

  /** Register the handler that processes every incoming message. */
  onMessage(handler: (msg: IncomingMessage) => Promise<OutgoingMessage>): void;
}
