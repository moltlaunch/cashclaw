import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorProvider, Program } from "@coral-xyz/anchor";
import axios from "axios";
import type { CashClawConfig } from "../config.js";

export interface AgentRegistration {
  agentId: string;
  name: string;
  owner: string;
  metadata: string;
  isActive: boolean;
  registrationTime: number;
}

export interface MarketplaceAgent {
  id: string;
  name: string;
  owner: string;
  description?: string;
  status: "active" | "inactive";
  lastSync: string;
}

export interface SyncResult {
  success: boolean;
  agentId: string;
  action: "created" | "updated" | "skipped" | "failed";
  error?: string;
}

class MarketplaceSyncService {
  private connection: Connection;
  private config: CashClawConfig;
  private retryCount = 3;
  private retryDelay = 2000;

  constructor(config: CashClawConfig) {
    this.config = config;
    this.connection = new Connection(config.rpcUrl || "https://api.mainnet-beta.solana.com");
  }

  async syncAgent(agentId: string): Promise<SyncResult> {
    try {
      // Fetch on-chain registration data
      const registration = await this.fetchOnChainRegistration(agentId);
      if (!registration) {
        return {
          success: false,
          agentId,
          action: "failed",
          error: "Agent not found on-chain"
        };
      }

      // Check if agent exists in marketplace
      const existingAgent = await this.fetchMarketplaceAgent(agentId);

      if (existingAgent) {
        // Update existing agent
        const updated = await this.updateMarketplaceAgent(registration);
        return {
          success: updated,
          agentId,
          action: updated ? "updated" : "failed",
          error: updated ? undefined : "Failed to update marketplace agent"
        };
      } else {
        // Create new agent in marketplace
        const created = await this.createMarketplaceAgent(registration);
        return {
          success: created,
          agentId,
          action: created ? "created" : "failed",
          error: created ? undefined : "Failed to create marketplace agent"
        };
      }
    } catch (error) {
      return {
        success: false,
        agentId,
        action: "failed",
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  async syncAllAgents(): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    try {
      // Get all registered agents from blockchain
      const registrations = await this.fetchAllOnChainRegistrations();

      for (const registration of registrations) {
        const result = await this.syncAgent(registration.agentId);
        results.push(result);

        // Small delay between syncs to avoid rate limiting
        await this.sleep(500);
      }
    } catch (error) {
      console.error("Failed to sync all agents:", error);
    }

    return results;
  }

  private async fetchOnChainRegistration(agentId: string): Promise<AgentRegistration | null> {
    try {
      // This would use the actual program interface to fetch agent data
      // For now, simulating the structure based on the issue details
      const agentPda = await this.getAgentPDA(agentId);
      const accountInfo = await this.connection.getAccountInfo(agentPda);

      if (!accountInfo) {
        return null;
      }

      // Parse account data (this would use proper borsh deserialization)
      const data = this.parseAgentAccountData(accountInfo.data);

      return {
        agentId,
        name: data.name,
        owner: data.owner,
        metadata: data.metadata,
        isActive: data.isActive,
        registrationTime: data.registrationTime
      };
    } catch (error) {
      console.error(`Failed to fetch on-chain registration for agent ${agentId}:`, error);
      return null;
    }
  }

  private async fetchAllOnChainRegistrations(): Promise<AgentRegistration[]> {
    try {
      // Get all agent accounts using getProgramAccounts
      const programId = new PublicKey(this.config.programId || "");
      const accounts = await this.connection.getProgramAccounts(programId, {
        filters: [
          {
            dataSize: 256 // Adjust based on actual account size
          }
        ]
      });

      const registrations: AgentRegistration[] = [];

      for (const account of accounts) {
        try {
          const data = this.parseAgentAccountData(account.account.data);
          registrations.push({
            agentId: data.agentId,
            name: data.name,
            owner: data.owner,
            metadata: data.metadata,
            isActive: data.isActive,
            registrationTime: data.registrationTime
          });
        } catch (error) {
          console.warn("Failed to parse agent account:", error);
        }
      }

      return registrations;
    } catch (error) {
      console.error("Failed to fetch all on-chain registrations:", error);
      return [];
    }
  }

  private async fetchMarketplaceAgent(agentId: string): Promise<MarketplaceAgent | null> {
    try {
      const response = await this.retryRequest(() =>
        axios.get(`${this.config.marketplaceApiUrl}/agents/${agentId}`, {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        })
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  private async createMarketplaceAgent(registration: AgentRegistration): Promise<boolean> {
    try {
      await this.retryRequest(() =>
        axios.post(`${this.config.marketplaceApiUrl}/agents`, {
          id: registration.agentId,
          name: registration.name,
          owner: registration.owner,
          description: this.extractDescription(registration.metadata),
          status: registration.isActive ? "active" : "inactive",
          onChainData: registration,
          lastSync: new Date().toISOString()
        }, {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        })
      );

      return true;
    } catch (error) {
      console.error(`Failed to create marketplace agent ${registration.agentId}:`, error);
      return false;
    }
  }

  private async updateMarketplaceAgent(registration: AgentRegistration): Promise<boolean> {
    try {
      await this.retryRequest(() =>
        axios.put(`${this.config.marketplaceApiUrl}/agents/${registration.agentId}`, {
          name: registration.name,
          owner: registration.owner,
          description: this.extractDescription(registration.metadata),
          status: registration.isActive ? "active" : "inactive",
          onChainData: registration,
          lastSync: new Date().toISOString()
        }, {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json'
          }
        })
      );

      return true;
    } catch (error) {
      console.error(`Failed to update marketplace agent ${registration.agentId}:`, error);
      return false;
    }
  }

  private async getAgentPDA(agentId: string): Promise<PublicKey> {
    const [pda] = await PublicKey.findProgramAddress(
      [
        Buffer.from("agent"),
        Buffer.from(agentId)
      ],
      new PublicKey(this.config.programId || "")
    );
    return pda;
  }

  private parseAgentAccountData(data: Buffer): any {
    // This would use proper borsh deserialization in a real implementation
    // For now, returning mock structure
    return {
      agentId: "mock_id",
      name: "Mock Agent",
      owner: "mock_owner",
      metadata: "{}",
      isActive: true,
      registrationTime: Date.now()
    };
  }

  private extractDescription(metadata: string): string {
    try {
      const parsed = JSON.parse(metadata);
      return parsed.description || "";
    } catch {
      return "";
    }
  }

  private async retryRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.retryCount - 1) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async validateRegistration(agentId: string): Promise<{
    onChain: boolean;
    marketplace: boolean;
    synced: boolean;
  }> {
    const [onChainReg, marketplaceAgent] = await Promise.all([
      this.fetchOnChainRegistration(agentId),
      this.fetchMarketplaceAgent(agentId)
    ]);

    return {
      onChain: !!onChainReg,
      marketplace: !!marketplaceAgent,
      synced: !!onChainReg && !!marketplaceAgent
    };
  }
}

export { MarketplaceSyncService };

export async function syncAgentRegistration(config: CashClawConfig, agentId: string): Promise<SyncResult> {
  const syncService = new MarketplaceSyncService(config);
  return await syncService.syncAgent(agentId);
}

export async function syncAllAgentRegistrations(config: CashClawConfig): Promise<SyncResult[]> {
  const syncService = new MarketplaceSyncService(config);
  return await syncService.syncAllAgents();
}
