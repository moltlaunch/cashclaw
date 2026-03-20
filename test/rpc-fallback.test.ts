import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RPCFallbackManager } from "../src/rpc/fallback-manager.js";
import { CloudflareDetector } from "../src/rpc/cloudflare-detector.js";
import { RPCClient } from "../src/rpc/client.js";
import type { RPCEndpoint, RPCResponse, RPCError } from "../src/rpc/types.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console methods to avoid test output noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  vi.clearAllMocks();
  console.error = vi.fn();
  console.warn = vi.fn();
});

afterEach(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

describe("CloudflareDetector", () => {
  it("should detect Cloudflare challenge page in response text", () => {
    const detector = new CloudflareDetector();

    expect(detector.isCloudflareChallenge("Just a moment...")).toBe(true);
    expect(detector.isCloudflareChallenge("Checking your browser before accessing")).toBe(true);
    expect(detector.isCloudflareChallenge("DDoS protection by Cloudflare")).toBe(true);
    expect(detector.isCloudflareChallenge("cf-browser-verification")).toBe(true);
  });

  it("should not detect normal responses as Cloudflare", () => {
    const detector = new CloudflareDetector();

    expect(detector.isCloudflareChallenge('{"jsonrpc":"2.0","result":"0x1234"}')).toBe(false);
    expect(detector.isCloudflareChallenge("Normal HTML page")).toBe(false);
    expect(detector.isCloudflareChallenge("")).toBe(false);
  });

  it("should detect Cloudflare from HTTP headers", () => {
    const detector = new CloudflareDetector();

    const headers = new Headers({
      "cf-ray": "123456789-LAX",
      "server": "cloudflare"
    });

    expect(detector.hasCloudflareHeaders(headers)).toBe(true);
  });

  it("should detect Cloudflare with partial headers", () => {
    const detector = new CloudflareDetector();

    const headers1 = new Headers({ "cf-ray": "abc123" });
    expect(detector.hasCloudflareHeaders(headers1)).toBe(true);

    const headers2 = new Headers({ "server": "cloudflare" });
    expect(detector.hasCloudflareHeaders(headers2)).toBe(true);
  });
});

describe("RPCFallbackManager", () => {
  const mockEndpoints: RPCEndpoint[] = [
    { url: "https://base-mainnet.nftx.xyz/a/chaepohghi0nep9i", priority: 1 },
    { url: "https://mainnet.base.org", priority: 2 },
    { url: "https://base.llamarpc.com", priority: 3 }
  ];

  it("should initialize with provided endpoints", () => {
    const manager = new RPCFallbackManager(mockEndpoints);
    expect(manager.getCurrentEndpoint()).toEqual(mockEndpoints[0]);
  });

  it("should rotate to next endpoint on failure", () => {
    const manager = new RPCFallbackManager(mockEndpoints);

    expect(manager.getCurrentEndpoint()).toEqual(mockEndpoints[0]);

    manager.markEndpointFailed(mockEndpoints[0].url);
    expect(manager.getCurrentEndpoint()).toEqual(mockEndpoints[1]);

    manager.markEndpointFailed(mockEndpoints[1].url);
    expect(manager.getCurrentEndpoint()).toEqual(mockEndpoints[2]);
  });

  it("should reset to first endpoint after all fail", () => {
    const manager = new RPCFallbackManager(mockEndpoints);

    // Mark all endpoints as failed
    mockEndpoints.forEach(endpoint => {
      manager.markEndpointFailed(endpoint.url);
    });

    expect(manager.getCurrentEndpoint()).toEqual(mockEndpoints[0]);
  });

  it("should track failed endpoints with timestamps", () => {
    const manager = new RPCFallbackManager(mockEndpoints);
    const beforeFailure = Date.now();

    manager.markEndpointFailed(mockEndpoints[0].url);
    const afterFailure = Date.now();

    const failedEndpoints = manager.getFailedEndpoints();
    expect(failedEndpoints).toHaveLength(1);
    expect(failedEndpoints[0].url).toBe(mockEndpoints[0].url);
    expect(failedEndpoints[0].failedAt).toBeGreaterThanOrEqual(beforeFailure);
    expect(failedEndpoints[0].failedAt).toBeLessThanOrEqual(afterFailure);
  });

  it("should recover endpoints after cooldown period", () => {
    const manager = new RPCFallbackManager(mockEndpoints, { failureCooldown: 100 });

    manager.markEndpointFailed(mockEndpoints[0].url);
    expect(manager.getFailedEndpoints()).toHaveLength(1);

    // Wait for cooldown
    return new Promise(resolve => {
      setTimeout(() => {
        expect(manager.getFailedEndpoints()).toHaveLength(0);
        resolve(undefined);
      }, 150);
    });
  });
});

describe("RPCClient with Fallback", () => {
  const mockEndpoints: RPCEndpoint[] = [
    { url: "https://base-mainnet.nftx.xyz/a/chaepohghi0nep9i", priority: 1 },
    { url: "https://mainnet.base.org", priority: 2 }
  ];

  it("should successfully make request with working endpoint", async () => {
    const mockResponse = {
      jsonrpc: "2.0" as const,
      id: 1,
      result: "0x1234567890"
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve(JSON.stringify(mockResponse))
    });

    const client = new RPCClient(mockEndpoints);
    const result = await client.call("eth_getBalance", ["0xF1a700000087c011413C21C9b357A6962Aa256f9", "latest"]);

    expect(result).toEqual(mockResponse);
    expect(mockFetch).toHaveBeenCalledWith(
      mockEndpoints[0].url,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: expect.stringContaining("eth_getBalance")
      })
    );
  });

  it("should fallback when primary endpoint returns Cloudflare challenge", async () => {
    // First endpoint returns Cloudflare challenge
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers({ "cf-ray": "123456789-LAX" }),
        text: () => Promise.resolve("Just a moment...")
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve('{"jsonrpc":"2.0","id":1,"result":"0x1234"}')
      });

    const client = new RPCClient(mockEndpoints);
    const result = await client.call("eth_getBalance", ["0xF1a700000087c011413C21C9b357A6962Aa256f9", "latest"]);

    expect(result.result).toBe("0x1234");
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(1, mockEndpoints[0].url, expect.any(Object));
    expect(mockFetch).toHaveBeenNthCalledWith(2, mockEndpoints[1].url, expect.any(Object));
  });

  it("should retry with exponential backoff on network errors", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("Network error"))
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve('{"jsonrpc":"2.0","id":1,"result":"0x5678"}')
      });

    const client = new RPCClient(mockEndpoints, { maxRetries: 3, retryDelay: 10 });
    const result = await client.call("eth_chainId", []);

    expect(result.result).toBe("0x5678");
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("should throw error when all endpoints fail", async () => {
    mockFetch.mockRejectedValue(new Error("All endpoints down"));

    const client = new RPCClient(mockEndpoints, { maxRetries: 1 });

    await expect(client.call("eth_getBalance", ["0x123", "latest"])).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(4); // 2 endpoints × 2 attempts each
  });

  it("should handle invalid JSON responses", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve("Invalid JSON{")
    });

    const client = new RPCClient(mockEndpoints);

    await expect(client.call("eth_chainId", [])).rejects.toThrow();
  });

  it("should detect and handle RPC error responses", async () => {
    const errorResponse = {
      jsonrpc: "2.0" as const,
      id: 1,
      error: {
        code: -32601,
        message: "Method not found"
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve(JSON.stringify(errorResponse))
    });

    const client = new RPCClient(mockEndpoints);

    await expect(client.call("invalid_method", [])).rejects.toThrow("Method not found");
  });

  it("should include request ID in RPC calls", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: () => Promise.resolve('{"jsonrpc":"2.0","id":42,"result":"0x1"}')
    });

    const client = new RPCClient(mockEndpoints);
    await client.call("eth_chainId", []);

    const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(callBody.id).toBeTypeOf("number");
    expect(callBody.jsonrpc).toBe("2.0");
    expect(callBody.method).toBe("eth_chainId");
  });

  it("should handle HTTP 500 errors as temporary failures", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: () => Promise.resolve("Internal Server Error")
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve('{"jsonrpc":"2.0","id":1,"result":"0x8545"}')
      });

    const client = new RPCClient(mockEndpoints);
    const result = await client.call("eth_chainId", []);

    expect(result.result).toBe("0x8545");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});

describe("Integration scenarios", () => {
  it("should handle the specific base-mainnet.nftx.xyz Cloudflare 403 scenario", async () => {
    const problematicEndpoints = [
      { url: "https://base-mainnet.nftx.xyz/a/chaepohghi0nep9i", priority: 1 },
      { url: "https://mainnet.base.org", priority: 2 }
    ];

    // Simulate exact Cloudflare response from the issue
    mockFetch
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers({
          "cf-ray": "8a9b1c2d3e4f5g6h-LAX",
          "server": "cloudflare"
        }),
        text: () => Promise.resolve(`
          <html>
          <head><title>Just a moment...</title></head>
          <body>
            <div>Checking your browser before accessing the website.</div>
            <div>This process is automatic. Your browser will redirect to your requested content shortly.</div>
          </body>
          </html>
        `)
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve('{"jsonrpc":"2.0","id":1,"result":"0x0"}')
      });

    const client = new RPCClient(problematicEndpoints);
    const result = await client.call("eth_getBalance", ["0xF1a700000087c011413C21C9b357A6962Aa256f9", "latest"]);

    expect(result.result).toBe("0x0");
    expect(mockFetch).toHaveBeenCalledWith(problematicEndpoints[0].url, expect.any(Object));
    expect(mockFetch).toHaveBeenCalledWith(problematicEndpoints[1].url, expect.any(Object));
  });

  it("should maintain endpoint failure state across multiple calls", async () => {
    const endpoints = [
      { url: "https://failing-rpc.example.com", priority: 1 },
      { url: "https://working-rpc.example.com", priority: 2 }
    ];

    // First endpoint always fails with Cloudflare
    mockFetch.mockImplementation((url) => {
      if (url === endpoints[0].url) {
        return Promise.resolve({
          ok: false,
          status: 403,
          headers: new Headers({ "cf-ray": "test" }),
          text: () => Promise.resolve("Just a moment...")
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: () => Promise.resolve('{"jsonrpc":"2.0","id":1,"result":"success"}')
      });
    });

    const client = new RPCClient(endpoints);

    // First call should fail over
    await client.call("eth_chainId", []);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second call should skip the failed endpoint
    mockFetch.mockClear();
    await client.call("eth_getBalance", ["0x123", "latest"]);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(endpoints[1].url, expect.any(Object));
  });
});
