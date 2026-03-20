export interface RpcEndpoint {
  url: string;
  name: string;
  rateLimit: {
    requestsPerSecond: number;
    burstLimit: number;
  };
  priority: number;
  requiresAuth: boolean;
}

export const BASE_MAINNET_ENDPOINTS: RpcEndpoint[] = [
  {
    url: "https://mainnet.base.org",
    name: "Base Official",
    rateLimit: {
      requestsPerSecond: 10,
      burstLimit: 50,
    },
    priority: 1,
    requiresAuth: false,
  },
  {
    url: "https://base-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
    name: "Alchemy Base",
    rateLimit: {
      requestsPerSecond: 25,
      burstLimit: 100,
    },
    priority: 2,
    requiresAuth: true,
  },
  {
    url: "https://base-mainnet.infura.io/v3/{INFURA_PROJECT_ID}",
    name: "Infura Base",
    rateLimit: {
      requestsPerSecond: 10,
      burstLimit: 50,
    },
    priority: 3,
    requiresAuth: true,
  },
  {
    url: "https://base-mainnet.public.blastapi.io",
    name: "Blast API",
    rateLimit: {
      requestsPerSecond: 12,
      burstLimit: 60,
    },
    priority: 4,
    requiresAuth: false,
  },
  {
    url: "https://base.gateway.tenderly.co",
    name: "Tenderly Gateway",
    rateLimit: {
      requestsPerSecond: 8,
      burstLimit: 40,
    },
    priority: 5,
    requiresAuth: false,
  },
  {
    url: "https://base-rpc.publicnode.com",
    name: "PublicNode Base",
    rateLimit: {
      requestsPerSecond: 5,
      burstLimit: 25,
    },
    priority: 6,
    requiresAuth: false,
  },
  {
    url: "https://rpc.ankr.com/base",
    name: "Ankr Base",
    rateLimit: {
      requestsPerSecond: 15,
      burstLimit: 75,
    },
    priority: 7,
    requiresAuth: false,
  },
  {
    url: "https://base.meowrpc.com",
    name: "MeowRPC Base",
    rateLimit: {
      requestsPerSecond: 10,
      burstLimit: 50,
    },
    priority: 8,
    requiresAuth: false,
  },
  {
    url: "https://base.llamarpc.com",
    name: "LlamaRPC Base",
    rateLimit: {
      requestsPerSecond: 8,
      burstLimit: 40,
    },
    priority: 9,
    requiresAuth: false,
  },
];

export const QUICKNODE_ENDPOINTS = {
  base: "https://maximum-serene-dinghy.base-mainnet.quiknode.pro/{QUICKNODE_TOKEN}",
  rateLimit: {
    requestsPerSecond: 30,
    burstLimit: 150,
  },
};

export interface EndpointHealth {
  url: string;
  isHealthy: boolean;
  lastChecked: number;
  responseTime: number;
  errorCount: number;
  consecutiveErrors: number;
}

export const MAX_CONSECUTIVE_ERRORS = 3;
export const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
export const ENDPOINT_TIMEOUT = 5000; // 5 seconds

export function getEndpointWithAuth(endpoint: RpcEndpoint, apiKeys: Record<string, string>): string {
  if (!endpoint.requiresAuth) {
    return endpoint.url;
  }

  let url = endpoint.url;

  if (url.includes("{ALCHEMY_API_KEY}")) {
    url = url.replace("{ALCHEMY_API_KEY}", apiKeys.ALCHEMY_API_KEY || "");
  }

  if (url.includes("{INFURA_PROJECT_ID}")) {
    url = url.replace("{INFURA_PROJECT_ID}", apiKeys.INFURA_PROJECT_ID || "");
  }

  if (url.includes("{QUICKNODE_TOKEN}")) {
    url = url.replace("{QUICKNODE_TOKEN}", apiKeys.QUICKNODE_TOKEN || "");
  }

  return url;
}

export function filterAvailableEndpoints(
  endpoints: RpcEndpoint[],
  apiKeys: Record<string, string>
): RpcEndpoint[] {
  return endpoints.filter(endpoint => {
    if (!endpoint.requiresAuth) return true;

    if (endpoint.url.includes("{ALCHEMY_API_KEY}")) {
      return !!apiKeys.ALCHEMY_API_KEY;
    }

    if (endpoint.url.includes("{INFURA_PROJECT_ID}")) {
      return !!apiKeys.INFURA_PROJECT_ID;
    }

    if (endpoint.url.includes("{QUICKNODE_TOKEN}")) {
      return !!apiKeys.QUICKNODE_TOKEN;
    }

    return false;
  });
}
