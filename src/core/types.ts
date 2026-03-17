export interface IncomingMessage {
  channelName: string;
  userId: string;
  text: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface OutgoingMessage {
  text: string;
  mode?: "text" | "voice" | "video" | "selfie";
}
