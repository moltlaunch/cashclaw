import { EventEmitter } from 'events';

export interface WebSocketManagerConfig {
  url: string;
  maxReconnectDelay?: number;
  reconnectDelayMultiplier?: number;
  initialReconnectDelay?: number;
  keepaliveInterval?: number;
  pongTimeout?: number;
}

export interface WebSocketMessage {
  type: string;
  data?: any;
}

export class WebSocketManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: Required<WebSocketManagerConfig>;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectDelay: number;
  private isConnecting = false;
  private shouldReconnect = true;
  private keepaliveTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;
  private lastPingTime = 0;

  constructor(config: WebSocketManagerConfig) {
    super();
    this.config = {
      url: config.url,
      maxReconnectDelay: config.maxReconnectDelay ?? 30000,
      reconnectDelayMultiplier: config.reconnectDelayMultiplier ?? 2,
      initialReconnectDelay: config.initialReconnectDelay ?? 1000,
      keepaliveInterval: config.keepaliveInterval ?? 20000,
      pongTimeout: config.pongTimeout ?? 10000,
    };
    this.reconnectDelay = this.config.initialReconnectDelay;
  }

  async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.shouldReconnect = true;
    this.isConnecting = true;

    try {
      await this.connectWs();
    } catch (error) {
      this.isConnecting = false;
      throw error;
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.clearKeepaliveTimers();

    if (this.ws) {
      this.ws.removeEventListener('open', this.handleOpen);
      this.ws.removeEventListener('message', this.handleMessage);
      this.ws.removeEventListener('close', this.handleClose);
      this.ws.removeEventListener('error', this.handleError);
      this.ws.removeEventListener('pong', this.handlePong);

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }

    this.isConnecting = false;
    this.emit('disconnected');
  }

  send(message: WebSocketMessage): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.emit('error', new Error('WebSocket not connected'));
      return false;
    }

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      this.emit('error', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private async connectWs(): Promise<void> {
    this.cleanup();

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url);

        this.ws.addEventListener('open', this.handleOpen);
        this.ws.addEventListener('message', this.handleMessage);
        this.ws.addEventListener('close', this.handleClose);
        this.ws.addEventListener('error', this.handleError);
        this.ws.addEventListener('pong', this.handlePong);

        const openHandler = () => {
          this.isConnecting = false;
          resolve();
        };

        const errorHandler = (event: Event) => {
          this.isConnecting = false;
          reject(new Error(`WebSocket connection failed: ${event}`));
        };

        this.ws.addEventListener('open', openHandler, { once: true });
        this.ws.addEventListener('error', errorHandler, { once: true });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  private cleanup(): void {
    this.clearKeepaliveTimers();

    if (this.ws) {
      this.ws.removeEventListener('open', this.handleOpen);
      this.ws.removeEventListener('message', this.handleMessage);
      this.ws.removeEventListener('close', this.handleClose);
      this.ws.removeEventListener('error', this.handleError);
      this.ws.removeEventListener('pong', this.handlePong);

      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  private handleOpen = (): void => {
    this.reconnectDelay = this.config.initialReconnectDelay;
    this.startKeepalive();
    this.emit('connected');
  };

  private handleMessage = (event: MessageEvent): void => {
    try {
      const message = JSON.parse(event.data);
      this.emit('message', message);
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${error}`));
    }
  };

  private handleClose = (event: CloseEvent): void => {
    this.clearKeepaliveTimers();
    this.emit('disconnected', { code: event.code, reason: event.reason });

    if (this.shouldReconnect) {
      this.scheduleReconnect();
    }
  };

  private handleError = (event: Event): void => {
    this.emit('error', new Error(`WebSocket error: ${event}`));
  };

  private handlePong = (): void => {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  };

  private scheduleReconnect(): void {
    this.clearReconnectTimer();

    this.reconnectTimeout = setTimeout(() => {
      if (this.shouldReconnect) {
        this.connectWs().catch((error) => {
          this.emit('error', error);
          this.increaseReconnectDelay();
          this.scheduleReconnect();
        });
      }
    }, this.reconnectDelay);

    this.increaseReconnectDelay();
  }

  private increaseReconnectDelay(): void {
    this.reconnectDelay = Math.min(
      this.reconnectDelay * this.config.reconnectDelayMultiplier,
      this.config.maxReconnectDelay
    );
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  private startKeepalive(): void {
    this.clearKeepaliveTimers();

    this.keepaliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingTime = Date.now();

        try {
          this.ws.ping();

          this.pongTimer = setTimeout(() => {
            this.emit('error', new Error('Keepalive pong timeout'));
            if (this.ws) {
              this.ws.close();
            }
          }, this.config.pongTimeout);
        } catch (error) {
          this.emit('error', error);
        }
      }
    }, this.config.keepaliveInterval);
  }

  private clearKeepaliveTimers(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }
}
