export interface AgentRegistration {
  id: string;
  name: string;
  description?: string;
  owner: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, unknown>;
}

export interface SyncStatus {
  lastSyncBlock: number;
  isIndexing: boolean;
  pendingTransactions: string[];
  lastError?: string;
  syncedAt: Date;
}

export interface MarketplaceResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
}

export interface BlockchainData {
  transactionHash: string;
  blockNumber: number;
  blockTimestamp: number;
  contractAddress: string;
  eventData: Record<string, unknown>;
}

export interface AgentOnChainData extends BlockchainData {
  agentId: string;
  agentName: string;
  ownerAddress: string;
  registrationData: Record<string, unknown>;
}

export interface IndexingError {
  transactionHash: string;
  agentId?: string;
  error: string;
  retryCount: number;
  lastAttempt: Date;
}

export interface MarketplaceAgent {
  id: string;
  name: string;
  description?: string;
  owner: string;
  isActive: boolean;
  onChainData: AgentOnChainData;
  marketplaceStatus: 'pending' | 'indexed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncConfig {
  rpcUrl: string;
  contractAddress: string;
  startBlock: number;
  batchSize: number;
  retryAttempts: number;
  retryDelay: number;
}
