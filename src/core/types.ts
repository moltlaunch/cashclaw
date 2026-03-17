/** Normalized incoming message from any channel. */
export interface IncomingMessage {
  channelName: string;
  userId: string;
  text: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

/** Outgoing response to be sent through a channel. */
export interface OutgoingMessage {
  text: string;
  mode?: "text" | "voice" | "video" | "selfie";
}
