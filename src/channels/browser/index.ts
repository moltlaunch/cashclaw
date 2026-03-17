import type { WebSocket, WebSocketServer } from "ws";
import type { IncomingMessage, OutgoingMessage } from "../../core/types.js";
import type { Channel } from "../types.js";

export class BrowserChannel implements Channel {
  name = "browser";
  requiredConfig: string[] = [];

  private wss: WebSocketServer | null = null;
  private handler: ((msg: IncomingMessage) => Promise<OutgoingMessage>) | null = null;
  private clients = new Set<WebSocket>();

  async start(_config: Record<string, string>): Promise<void> {
    // WSS is attached to the HTTP server externally via attachWSS()
  }

  attachWSS(wss: WebSocketServer): void {
    this.wss = wss;
    wss.on("connection", (ws: WebSocket) => {
      this.clients.add(ws);
      ws.on("message", async (data: Buffer | string) => {
        const msg: IncomingMessage = {
          channelName: "browser",
          userId: "owner",
          text: data.toString(),
          timestamp: Date.now(),
        };
        if (this.handler) {
          const response = await this.handler(msg);
          ws.send(JSON.stringify(response));
        }
      });
      ws.on("close", () => this.clients.delete(ws));
    });
  }

  async send(_userId: string, message: OutgoingMessage): Promise<void> {
    const data = JSON.stringify(message);
    for (const ws of this.clients) {
      ws.send(data);
    }
  }

  onMessage(handler: (msg: IncomingMessage) => Promise<OutgoingMessage>): void {
    this.handler = handler;
  }

  async stop(): Promise<void> {
    this.wss?.close();
  }
}
