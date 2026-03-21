import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketManager } from "../src/websocket/manager.js";

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  private listeners: Map<string, Function[]> = new Map();

  constructor(url: string) {
    this.url = url;
    // Simulate connection opening after a tick
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.dispatchEvent({ type: "open" });
    }, 0);
  }

  addEventListener(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  removeEventListener(event: string, callback: Function) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  removeAllListeners() {
    this.listeners.clear();
  }

  dispatchEvent(event: { type: string; [key: string]: any }) {
    const callbacks = this.listeners.get(event.type) || [];
    callbacks.forEach(callback => callback(event));
  }

  send(data: string) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      this.dispatchEvent({ type: "close", code: code || 1000, reason: reason || "" });
    }, 0);
  }

  terminate() {
    this.readyState = MockWebSocket.CLOSED;
    this.removeAllListeners();
  }

  ping() {
    // Simulate ping method for keepalive
  }
}

// Mock the global WebSocket
global.WebSocket = MockWebSocket as any;

describe("WebSocketManager", () => {
  let wsManager: WebSocketManager;
  let mockSetTimeout: any;
  let mockClearTimeout: any;
  let mockSetInterval: any;
  let mockClearInterval: any;

  beforeEach(() => {
    // Mock timers
    mockSetTimeout = vi.fn((callback, delay) => {
      return setTimeout(callback, delay);
    });
    mockClearTimeout = vi.fn(clearTimeout);
    mockSetInterval = vi.fn((callback, interval) => {
      return setInterval(callback, interval);
    });
    mockClearInterval = vi.fn(clearInterval);

    global.setTimeout = mockSetTimeout;
    global.clearTimeout = mockClearTimeout;
    global.setInterval = mockSetInterval;
    global.clearInterval = mockClearInterval;

    wsManager = new WebSocketManager("ws://localhost:8080");
  });

  afterEach(() => {
    wsManager.disconnect();
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  describe("Connection establishment", () => {
    it("should connect successfully", async () => {
      const connectPromise = wsManager.connect();

      await new Promise(resolve => setTimeout(resolve, 10));

      await expect(connectPromise).resolves.toBeUndefined();
      expect(wsManager.isConnected()).toBe(true);
    });

    it("should emit connected event", async () => {
      const connectedSpy = vi.fn();
      wsManager.on("connected", connectedSpy);

      await wsManager.connect();

      expect(connectedSpy).toHaveBeenCalledOnce();
    });

    it("should handle connection errors", async () => {
      const errorSpy = vi.fn();
      wsManager.on("error", errorSpy);

      const connectPromise = wsManager.connect();

      // Simulate connection error
      const ws = (wsManager as any).ws;
      ws.dispatchEvent({ type: "error", error: new Error("Connection failed") });

      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("Message handling", () => {
    beforeEach(async () => {
      await wsManager.connect();
    });

    it("should receive messages", async () => {
      const messageSpy = vi.fn();
      wsManager.on("message", messageSpy);

      const testMessage = { type: "test", data: "hello" };
      const ws = (wsManager as any).ws;
      ws.dispatchEvent({
        type: "message",
        data: JSON.stringify(testMessage)
      });

      expect(messageSpy).toHaveBeenCalledWith(testMessage);
    });

    it("should send messages", () => {
      const testMessage = { type: "ping", timestamp: Date.now() };

      expect(() => {
        wsManager.send(testMessage);
      }).not.toThrow();
    });

    it("should handle malformed messages", () => {
      const errorSpy = vi.fn();
      wsManager.on("error", errorSpy);

      const ws = (wsManager as any).ws;
      ws.dispatchEvent({
        type: "message",
        data: "invalid json{"
      });

      expect(errorSpy).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("Reconnection with backoff", () => {
    beforeEach(async () => {
      await wsManager.connect();
    });

    it("should schedule reconnection on close", async () => {
      const ws = (wsManager as any).ws;

      // Simulate unexpected close
      ws.dispatchEvent({ type: "close", code: 1006, reason: "Connection lost" });

      expect(mockSetTimeout).toHaveBeenCalled();
      expect(wsManager.isConnected()).toBe(false);
    });

    it("should increase backoff delay on consecutive failures", async () => {
      vi.useFakeTimers();

      const ws = (wsManager as any).ws;

      // First disconnection
      ws.dispatchEvent({ type: "close", code: 1006 });
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 1000);

      // Simulate reconnection failure
      vi.advanceTimersByTime(1000);
      const newWs = (wsManager as any).ws;
      newWs.dispatchEvent({ type: "error", error: new Error("Failed") });
      newWs.dispatchEvent({ type: "close", code: 1006 });

      // Second disconnection should have longer delay
      expect(mockSetTimeout).toHaveBeenCalledWith(expect.any(Function), 2000);

      vi.useRealTimers();
    });

    it("should reset backoff on successful reconnection", async () => {
      vi.useFakeTimers();

      const ws = (wsManager as any).ws;

      // Disconnect
      ws.dispatchEvent({ type: "close", code: 1006 });

      // Reconnect successfully
      vi.advanceTimersByTime(1000);
      const newWs = (wsManager as any).ws;
      newWs.readyState = MockWebSocket.OPEN;
      newWs.dispatchEvent({ type: "open" });

      // Next disconnection should start with initial delay again
      newWs.dispatchEvent({ type: "close", code: 1006 });
      expect(mockSetTimeout).toHaveBeenLastCalledWith(expect.any(Function), 1000);

      vi.useRealTimers();
    });

    it("should not reconnect error followed by close events twice", async () => {
      const reconnectSpy = vi.spyOn(wsManager as any, "scheduleReconnection");

      const ws = (wsManager as any).ws;

      // Simulate error followed by close (common pattern)
      ws.dispatchEvent({ type: "error", error: new Error("Network error") });
      ws.dispatchEvent({ type: "close", code: 1006 });

      // Should only schedule reconnection once
      expect(reconnectSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Keepalive functionality", () => {
    beforeEach(async () => {
      await wsManager.connect();
    });

    it("should start keepalive on connection", () => {
      expect(mockSetInterval).toHaveBeenCalledWith(expect.any(Function), 20000);
    });

    it("should send ping messages periodically", async () => {
      vi.useFakeTimers();

      const sendSpy = vi.spyOn(wsManager, "send");

      // Advance time to trigger keepalive
      vi.advanceTimersByTime(20000);

      expect(sendSpy).toHaveBeenCalledWith({ type: "ping", timestamp: expect.any(Number) });

      vi.useRealTimers();
    });

    it("should handle pong responses", () => {
      const ws = (wsManager as any).ws;

      // Send pong response
      ws.dispatchEvent({
        type: "message",
        data: JSON.stringify({ type: "pong", timestamp: Date.now() })
      });

      // Should clear pong timeout
      expect(mockClearTimeout).toHaveBeenCalled();
    });

    it("should reconnect on pong timeout", async () => {
      vi.useFakeTimers();

      const closeSpy = vi.spyOn((wsManager as any).ws, "close");

      // Trigger keepalive ping
      vi.advanceTimersByTime(20000);

      // Advance past pong timeout (10 seconds)
      vi.advanceTimersByTime(10000);

      expect(closeSpy).toHaveBeenCalledWith(1000, "Pong timeout");

      vi.useRealTimers();
    });
  });

  describe("Error handling", () => {
    it("should handle WebSocket constructor errors", () => {
      // Mock WebSocket constructor to throw
      const originalWebSocket = global.WebSocket;
      global.WebSocket = class {
        constructor() {
          throw new Error("Cannot create WebSocket");
        }
      } as any;

      const errorManager = new WebSocketManager("invalid://url");

      expect(async () => {
        await errorManager.connect();
      }).rejects.toThrow();

      global.WebSocket = originalWebSocket;
    });

    it("should emit error events", async () => {
      await wsManager.connect();

      const errorSpy = vi.fn();
      wsManager.on("error", errorSpy);

      const ws = (wsManager as any).ws;
      const testError = new Error("Test error");
      ws.dispatchEvent({ type: "error", error: testError });

      expect(errorSpy).toHaveBeenCalledWith(testError);
    });

    it("should handle send errors when disconnected", () => {
      wsManager.disconnect();

      expect(() => {
        wsManager.send({ type: "test" });
      }).toThrow("WebSocket is not connected");
    });
  });

  describe("Cleanup", () => {
    beforeEach(async () => {
      await wsManager.connect();
    });

    it("should clean up on disconnect", () => {
      wsManager.disconnect();

      expect(mockClearInterval).toHaveBeenCalled(); // keepalive cleanup
      expect(mockClearTimeout).toHaveBeenCalled(); // timeout cleanup
      expect(wsManager.isConnected()).toBe(false);
    });

    it("should remove old listeners on reconnection", async () => {
      const ws = (wsManager as any).ws;
      const removeAllListenersSpy = vi.spyOn(ws, "removeAllListeners");
      const terminateSpy = vi.spyOn(ws, "terminate");

      // Force reconnection
      ws.dispatchEvent({ type: "close", code: 1006 });

      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait for reconnection

      expect(removeAllListenersSpy).toHaveBeenCalled();
      expect(terminateSpy).toHaveBeenCalled();
    });

    it("should clear all timers on multiple disconnects", () => {
      wsManager.disconnect();
      wsManager.disconnect(); // Should not throw or cause issues

      expect(wsManager.isConnected()).toBe(false);
    });
  });

  describe("Connection state management", () => {
    it("should report correct connection state", async () => {
      expect(wsManager.isConnected()).toBe(false);

      await wsManager.connect();
      expect(wsManager.isConnected()).toBe(true);

      wsManager.disconnect();
      expect(wsManager.isConnected()).toBe(false);
    });

    it("should prevent multiple concurrent connections", async () => {
      const connectPromise1 = wsManager.connect();
      const connectPromise2 = wsManager.connect();

      await Promise.all([connectPromise1, connectPromise2]);

      // Should only create one WebSocket instance
      expect(wsManager.isConnected()).toBe(true);
    });

    it("should handle disconnect during connection", async () => {
      const connectPromise = wsManager.connect();

      // Disconnect before connection completes
      wsManager.disconnect();

      await expect(connectPromise).rejects.toThrow();
      expect(wsManager.isConnected()).toBe(false);
    });
  });
});
