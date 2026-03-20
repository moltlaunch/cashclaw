import { createHash } from "crypto";

export interface RpcEndpoint {
  url: string;
  weight: number;
  lastFailure?: number;
  consecutiveFailures: number;
  isHealthy: boolean;
}

export interface FallbackConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  healthCheckInterval: number;
  failureThreshold: number;
  recoveryTime: number;
}

export interface RequestConfig {
  method: string;
  params: any[];
  timeout?: number;
  headers?: Record<string, string>;
}

const DEFAULT_CONFIG: FallbackConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  healthCheckInterval: 60000,
  failureThreshold: 3,
  recoveryTime: 300000, // 5 minutes
};

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101",
];

export class RpcFallbackManager {
  private endpoints: RpcEndpoint[] = [];
  private config: FallbackConfig;
  private healthCheckTimer?: NodeJS.Timeout;
  private requestCount = 0;

  constructor(
    endpointUrls: string[],
    config: Partial<FallbackConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.initializeEndpoints(endpointUrls);
    this.startHealthChecks();
  }

  private initializeEndpoints(urls: string[]) {
    this.endpoints = urls.map((url) => ({
      url,
      weight: 1,
      consecutiveFailures: 0,
      isHealthy: true,
    }));
  }

  private startHealthChecks() {
    this.healthCheckTimer = setInterval(
      () => this.performHealthChecks(),
      this.config.healthCheckInterval
    );
  }

  private async performHealthChecks() {
    const checks = this.endpoints.map((endpoint) =>
      this.checkEndpointHealth(endpoint)
    );
    await Promise.allSettled(checks);
  }

  private async checkEndpointHealth(endpoint: RpcEndpoint) {
    try {
      const response = await this.makeRawRequest(endpoint.url, {
        method: "eth_blockNumber",
        params: [],
      });

      if (response.error) {
        this.markEndpointFailed(endpoint);
      } else {
        this.markEndpointHealthy(endpoint);
      }
    } catch (error) {
      this.markEndpointFailed(endpoint);
    }
  }

  private markEndpointFailed(endpoint: RpcEndpoint) {
    endpoint.consecutiveFailures++;
    endpoint.lastFailure = Date.now();

    if (endpoint.consecutiveFailures >= this.config.failureThreshold) {
      endpoint.isHealthy = false;
    }
  }

  private markEndpointHealthy(endpoint: RpcEndpoint) {
    endpoint.consecutiveFailures = 0;
    endpoint.isHealthy = true;
    endpoint.lastFailure = undefined;
  }

  private selectEndpoint(): RpcEndpoint | null {
    const now = Date.now();

    // First, try healthy endpoints
    const healthyEndpoints = this.endpoints.filter((ep) => ep.isHealthy);

    if (healthyEndpoints.length > 0) {
      return this.weightedSelect(healthyEndpoints);
    }

    // If no healthy endpoints, check if any can be recovered
    const recoverableEndpoints = this.endpoints.filter((ep) => {
      if (!ep.lastFailure) return false;
      return (now - ep.lastFailure) > this.config.recoveryTime;
    });

    if (recoverableEndpoints.length > 0) {
      const endpoint = recoverableEndpoints[0];
      endpoint.isHealthy = true;
      endpoint.consecutiveFailures = 0;
      return endpoint;
    }

    return this.endpoints[0] || null;
  }

  private weightedSelect(endpoints: RpcEndpoint[]): RpcEndpoint {
    if (endpoints.length === 1) {
      return endpoints[0];
    }

    const totalWeight = endpoints.reduce((sum, ep) => sum + ep.weight, 0);
    let random = Math.random() * totalWeight;

    for (const endpoint of endpoints) {
      random -= endpoint.weight;
      if (random <= 0) {
        return endpoint;
      }
    }

    return endpoints[0];
  }

  private getRandomUserAgent(): string {
    return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  }

  private isCloudflareChallenge(response: any): boolean {
    if (typeof response !== "string") return false;

    return (
      response.includes("Just a moment...") ||
      response.includes("Checking your browser") ||
      response.includes("cloudflare") ||
      response.includes("cf-browser-verification")
    );
  }

  private async makeRawRequest(
    url: string,
    requestConfig: RequestConfig
  ): Promise<any> {
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": this.getRandomUserAgent(),
      ...requestConfig.headers,
    };

    const requestId = createHash("sha256")
      .update(`${url}-${Date.now()}-${this.requestCount++}`)
      .digest("hex")
      .substring(0, 16);

    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: requestId,
      method: requestConfig.method,
      params: requestConfig.params,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      requestConfig.timeout || 10000
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 403 || response.status === 503) {
          const text = await response.text();
          if (this.isCloudflareChallenge(text)) {
            throw new Error(`Cloudflare challenge detected on ${url}`);
          }
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(`RPC error: ${data.error.message || "Unknown error"}`);
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.config.maxDelay);
  }

  async makeRequest(requestConfig: RequestConfig): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      const endpoint = this.selectEndpoint();

      if (!endpoint) {
        throw new Error("No available RPC endpoints");
      }

      try {
        const result = await this.makeRawRequest(endpoint.url, requestConfig);

        // Success - mark endpoint as healthy if it was previously failing
        if (endpoint.consecutiveFailures > 0) {
          this.markEndpointHealthy(endpoint);
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        this.markEndpointFailed(endpoint);

        if (attempt < this.config.maxRetries) {
          const delay = this.calculateDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error("All RPC endpoints failed");
  }

  addEndpoint(url: string, weight = 1) {
    const existing = this.endpoints.find((ep) => ep.url === url);
    if (existing) {
      existing.weight = weight;
    } else {
      this.endpoints.push({
        url,
        weight,
        consecutiveFailures: 0,
        isHealthy: true,
      });
    }
  }

  removeEndpoint(url: string) {
    this.endpoints = this.endpoints.filter((ep) => ep.url !== url);
  }

  getHealthyEndpoints(): RpcEndpoint[] {
    return this.endpoints.filter((ep) => ep.isHealthy);
  }

  getEndpointStats() {
    return this.endpoints.map((ep) => ({
      url: ep.url,
      isHealthy: ep.isHealthy,
      consecutiveFailures: ep.consecutiveFailures,
      lastFailure: ep.lastFailure,
      weight: ep.weight,
    }));
  }

  destroy() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
}

export const createRpcManager = (
  endpoints: string[],
  config?: Partial<FallbackConfig>
): RpcFallbackManager => {
  return new RpcFallbackManager(endpoints, config);
};
