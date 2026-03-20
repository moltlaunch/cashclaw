import { PublicKey, Connection, ConnectionConfig } from '@solana/web3.js';

export interface RPCEndpoint {
  url: string;
  name: string;
  priority: number;
  isHealthy: boolean;
  lastChecked: number;
  consecutiveFailures: number;
}

export interface RPCClientConfig {
  endpoints: RPCEndpoint[];
  maxRetries: number;
  healthCheckInterval: number;
  requestTimeout: number;
  fallbackDelay: number;
}

export interface RPCResponse<T = any> {
  jsonrpc: string;
  id: string | number;
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class EnhancedRPCClient {
  private config: RPCClientConfig;
  private currentEndpointIndex: number = 0;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config: RPCClientConfig) {
    this.config = {
      maxRetries: 3,
      healthCheckInterval: 30000,
      requestTimeout: 15000,
      fallbackDelay: 1000,
      ...config,
    };

    this.startHealthChecking();
  }

  private startHealthChecking(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  private async performHealthChecks(): Promise<void> {
    const promises = this.config.endpoints.map(async (endpoint, index) => {
      try {
        const response = await this.makeRequest(endpoint, {
          method: 'eth_blockNumber',
          params: [],
        }, { timeout: 5000 });

        endpoint.isHealthy = !!response.result;
        endpoint.consecutiveFailures = 0;
        endpoint.lastChecked = Date.now();
      } catch (error) {
        endpoint.isHealthy = false;
        endpoint.consecutiveFailures++;
        endpoint.lastChecked = Date.now();
      }
    });

    await Promise.allSettled(promises);
    this.sortEndpointsByHealth();
  }

  private sortEndpointsByHealth(): void {
    this.config.endpoints.sort((a, b) => {
      if (a.isHealthy && !b.isHealthy) return -1;
      if (!a.isHealthy && b.isHealthy) return 1;
      if (a.consecutiveFailures !== b.consecutiveFailures) {
        return a.consecutiveFailures - b.consecutiveFailures;
      }
      return b.priority - a.priority;
    });
  }

  private isCloudflareBlocked(response: Response): boolean {
    return (
      response.status === 403 ||
      response.status === 429 ||
      response.headers.get('server')?.toLowerCase().includes('cloudflare') ||
      response.headers.get('cf-ray') !== null
    );
  }

  private async makeRequest(
    endpoint: RPCEndpoint,
    payload: { method: string; params: any[] },
    options: { timeout?: number } = {}
  ): Promise<RPCResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeout || this.config.requestTimeout
    );

    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'moltlaunch-client/2.17.0',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Math.random().toString(36).substr(2, 9),
          ...payload,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (this.isCloudflareBlocked(response)) {
        throw new Error(`Cloudflare block detected on ${endpoint.name} (${response.status})`);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const jsonResponse = await response.json();

      if (jsonResponse.error) {
        throw new Error(`RPC Error ${jsonResponse.error.code}: ${jsonResponse.error.message}`);
      }

      return jsonResponse;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  async request(method: string, params: any[] = []): Promise<any> {
    let lastError: Error;

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      const healthyEndpoints = this.config.endpoints.filter(ep => ep.isHealthy);
      const endpointsToTry = healthyEndpoints.length > 0 ? healthyEndpoints : this.config.endpoints;

      for (let i = 0; i < endpointsToTry.length; i++) {
        const endpointIndex = (this.currentEndpointIndex + i) % endpointsToTry.length;
        const endpoint = endpointsToTry[endpointIndex];

        try {
          const response = await this.makeRequest(endpoint, { method, params });

          // Success - update endpoint status and return
          endpoint.isHealthy = true;
          endpoint.consecutiveFailures = 0;
          this.currentEndpointIndex = endpointIndex;

          return response.result;
        } catch (error) {
          lastError = error as Error;
          endpoint.consecutiveFailures++;

          // Mark as unhealthy if Cloudflare blocked or too many failures
          if (error.message.includes('Cloudflare') || endpoint.consecutiveFailures >= 3) {
            endpoint.isHealthy = false;
          }

          console.warn(`RPC request failed on ${endpoint.name}: ${error.message}`);

          // Small delay before trying next endpoint
          if (i < endpointsToTry.length - 1) {
            await new Promise(resolve => setTimeout(resolve, this.config.fallbackDelay));
          }
        }
      }

      // All endpoints failed this attempt - wait before retry
      if (attempt < this.config.maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, this.config.fallbackDelay * (attempt + 1)));
      }
    }

    throw new Error(`All RPC endpoints failed after ${this.config.maxRetries} attempts. Last error: ${lastError.message}`);
  }

  async getBalance(address: string): Promise<string> {
    const result = await this.request('eth_getBalance', [address, 'latest']);
    return result;
  }

  async getBlockNumber(): Promise<number> {
    const result = await this.request('eth_blockNumber', []);
    return parseInt(result, 16);
  }

  async getTransactionReceipt(txHash: string): Promise<any> {
    return await this.request('eth_getTransactionReceipt', [txHash]);
  }

  async estimateGas(transaction: any): Promise<string> {
    return await this.request('eth_estimateGas', [transaction]);
  }

  async sendTransaction(signedTx: string): Promise<string> {
    return await this.request('eth_sendRawTransaction', [signedTx]);
  }

  getHealthyEndpoints(): RPCEndpoint[] {
    return this.config.endpoints.filter(endpoint => endpoint.isHealthy);
  }

  getCurrentEndpoint(): RPCEndpoint {
    return this.config.endpoints[this.currentEndpointIndex];
  }

  addEndpoint(endpoint: Omit<RPCEndpoint, 'isHealthy' | 'lastChecked' | 'consecutiveFailures'>): void {
    this.config.endpoints.push({
      ...endpoint,
      isHealthy: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    });
    this.sortEndpointsByHealth();
  }

  removeEndpoint(url: string): void {
    this.config.endpoints = this.config.endpoints.filter(ep => ep.url !== url);
    this.currentEndpointIndex = 0;
  }

  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
}

export const createDefaultRPCClient = (): EnhancedRPCClient => {
  const endpoints: RPCEndpoint[] = [
    {
      url: 'https://mainnet.base.org',
      name: 'Base Official',
      priority: 100,
      isHealthy: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    },
    {
      url: 'https://base-rpc.publicnode.com',
      name: 'PublicNode Base',
      priority: 90,
      isHealthy: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    },
    {
      url: 'https://base.blockpi.network/v1/rpc/public',
      name: 'BlockPI Base',
      priority: 80,
      isHealthy: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    },
    {
      url: 'https://base-mainnet.nftx.xyz/a/chaepohghi0nep9i',
      name: 'NFTX Base',
      priority: 70,
      isHealthy: true,
      lastChecked: 0,
      consecutiveFailures: 0,
    },
  ];

  return new EnhancedRPCClient({
    endpoints,
    maxRetries: 3,
    healthCheckInterval: 30000,
    requestTimeout: 15000,
    fallbackDelay: 1000,
  });
};
