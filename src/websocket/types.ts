export interface WebSocketConfig {
  url: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  keepaliveInterval: number;
  pongTimeout: number;
  backoffMultiplier: number;
  maxBackoffInterval: number;
}

export interface WebSocketState {
  isConnected: boolean;
  reconnectAttempts: number;
  lastReconnectTime: number;
  currentBackoffInterval: number;
}

export interface WebSocketMessage {
  type: string;
  data?: unknown;
  timestamp?: number;
}

export interface WebSocketEventHandlers {
  onOpen?: (event: Event) => void;
  onMessage?: (message: WebSocketMessage) => void;
  onError?: (error: Event) => void;
  onClose?: (event: CloseEvent) => void;
  onReconnect?: (attempt: number) => void;
  onReconnectFailed?: (maxAttempts: number) => void;
}

export interface KeepaliveConfig {
  pingInterval: number;
  pongTimeout: number;
  enabled: boolean;
}

export interface ReconnectionConfig {
  initialInterval: number;
  maxInterval: number;
  multiplier: number;
  maxAttempts: number;
  jitter: boolean;
}

export interface WebSocketConnectionOptions {
  url: string;
  protocols?: string | string[];
  keepalive?: KeepaliveConfig;
  reconnection?: ReconnectionConfig;
  eventHandlers?: WebSocketEventHandlers;
}

export interface WebSocketManager {
  connect(options: WebSocketConnectionOptions): Promise<void>;
  disconnect(): Promise<void>;
  send(message: WebSocketMessage): Promise<void>;
  getState(): WebSocketState;
  isConnected(): boolean;
}

export interface PingPongState {
  pingTimer?: NodeJS.Timeout;
  pongTimer?: NodeJS.Timeout;
  lastPingTime?: number;
  pendingPong: boolean;
}

export enum WebSocketEventType {
  OPEN = 'open',
  MESSAGE = 'message',
  ERROR = 'error',
  CLOSE = 'close',
  PING = 'ping',
  PONG = 'pong',
  RECONNECT = 'reconnect',
  RECONNECT_FAILED = 'reconnect_failed'
}

export enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3
}

export interface WebSocketError extends Error {
  code?: number;
  reason?: string;
  wasClean?: boolean;
}

export interface CleanupOptions {
  clearTimers: boolean;
  removeListeners: boolean;
  terminateConnection: boolean;
}
