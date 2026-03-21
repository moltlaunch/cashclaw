import { EventEmitter } from 'events';
import type { Task } from './types.js';
import { WebSocketManager } from '../websocket/manager.js';

export interface MoltlaunchClientConfig {
  apiUrl?: string;
  wsUrl?: string;
  apiKey?: string;
}

export interface TaskUpdate {
  type: 'task_created' | 'task_updated' | 'task_completed' | 'task_cancelled';
  task: Task;
}

export class MoltlaunchClient extends EventEmitter {
  private config: Required<MoltlaunchClientConfig>;
  private wsManager: WebSocketManager;

  constructor(config: MoltlaunchClientConfig = {}) {
    super();

    this.config = {
      apiUrl: config.apiUrl || 'https://api.moltlaunch.com',
      wsUrl: config.wsUrl || 'wss://api.moltlaunch.com/ws',
      apiKey: config.apiKey || process.env.MOLTLAUNCH_API_KEY || '',
    };

    this.wsManager = new WebSocketManager(this.config.wsUrl, {
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      pingInterval: 20000,
      pongTimeout: 10000,
    });

    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers(): void {
    this.wsManager.on('connected', () => {
      console.log('Connected to Moltlaunch WebSocket');
      this.emit('connected');

      // Send authentication if API key is available
      if (this.config.apiKey) {
        this.wsManager.send(JSON.stringify({
          type: 'auth',
          token: this.config.apiKey,
        }));
      }
    });

    this.wsManager.on('disconnected', () => {
      console.log('Disconnected from Moltlaunch WebSocket');
      this.emit('disconnected');
    });

    this.wsManager.on('message', (data: string) => {
      try {
        const message = JSON.parse(data);
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });

    this.wsManager.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
      this.emit('error', error);
    });
  }

  private handleWebSocketMessage(message: any): void {
    switch (message.type) {
      case 'task_created':
      case 'task_updated':
      case 'task_completed':
      case 'task_cancelled':
        this.emit('taskUpdate', {
          type: message.type,
          task: message.task,
        } as TaskUpdate);
        break;

      case 'auth_success':
        console.log('WebSocket authentication successful');
        this.emit('authenticated');
        break;

      case 'auth_error':
        console.error('WebSocket authentication failed:', message.error);
        this.emit('authError', new Error(message.error));
        break;

      case 'pong':
        // Handled internally by WebSocketManager
        break;

      default:
        console.warn('Unknown WebSocket message type:', message.type);
        this.emit('message', message);
    }
  }

  async connect(): Promise<void> {
    return this.wsManager.connect();
  }

  async disconnect(): Promise<void> {
    return this.wsManager.disconnect();
  }

  isConnected(): boolean {
    return this.wsManager.isConnected();
  }

  async getTasks(filters?: { status?: string; assignee?: string }): Promise<Task[]> {
    const url = new URL('/api/tasks', this.config.apiUrl);

    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, value);
        }
      });
    }

    const response = await fetch(url.toString(), {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch tasks: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tasks || [];
  }

  async getTask(taskId: string): Promise<Task | null> {
    const response = await fetch(`${this.config.apiUrl}/api/tasks/${taskId}`, {
      headers: this.getHeaders(),
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch task: ${response.statusText}`);
    }

    const data = await response.json();
    return data.task;
  }

  async submitQuote(taskId: string, priceEth: string): Promise<void> {
    const response = await fetch(`${this.config.apiUrl}/api/tasks/${taskId}/quote`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        price_eth: priceEth,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit quote: ${response.statusText}`);
    }
  }

  async declineTask(taskId: string, reason?: string): Promise<void> {
    const response = await fetch(`${this.config.apiUrl}/api/tasks/${taskId}/decline`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reason: reason || 'Not interested',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to decline task: ${response.statusText}`);
    }
  }

  async submitWork(taskId: string, result: string): Promise<void> {
    const response = await fetch(`${this.config.apiUrl}/api/tasks/${taskId}/submit`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        result,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to submit work: ${response.statusText}`);
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  send(message: any): void {
    if (typeof message === 'object') {
      this.wsManager.send(JSON.stringify(message));
    } else {
      this.wsManager.send(message);
    }
  }
}
