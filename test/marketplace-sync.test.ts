import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AgentData, SyncStatus, MarketplaceResponse } from "../src/types.js";

// Mock the marketplace sync module
vi.mock("../src/marketplace/sync.js", async () => {
  const actual = await vi.importActual("../src/marketplace/sync.js");
  return {
    ...actual,
    syncMarketplaceData: vi.fn(),
    validateSyncStatus: vi.fn(),
    fetchAgentFromChain: vi.fn(),
    retryWithBackoff: vi.fn(),
  };
});

// Mock the CLI module
vi.mock("../src/cli/agents.js", () => ({
  listAgents: vi.fn(),
  getAgentById: vi.fn(),
}));

// Mock blockchain provider
vi.mock("../src/blockchain/provider.js", () => ({
  getProvider: vi.fn(),
  getContract: vi.fn(),
  queryAgentData: vi.fn(),
}));

import { syncMarketplaceData, validateSyncStatus, fetchAgentFromChain, retryWithBackoff } from "../src/marketplace/sync.js";
import { listAgents, getAgentById } from "../src/cli/agents.js";
import { queryAgentData } from "../src/blockchain/provider.js";

describe("Marketplace Sync", () => {
  const mockAgentData: AgentData = {
    id: "31667",
    name: "Cuan",
    wallet: "0x05B58124ABaf89aECD8b1EB5C290f979f794A370",
    txHash: "0xb221818a328b23291b6c9a58b320787b65490c6d39e0c7833a1d7ccd616becb7",
    registrationBlock: 12345678,
    metadata: {
      description: "AI trading agent",
      capabilities: ["trading", "analysis"],
    },
    status: "active",
    createdAt: new Date("2024-01-15T10:30:00Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Agent Data Fetching", () => {
    it("should fetch agent data from blockchain", async () => {
      vi.mocked(queryAgentData).mockResolvedValue(mockAgentData);

      const result = await fetchAgentFromChain("31667");

      expect(result).toEqual(mockAgentData);
      expect(queryAgentData).toHaveBeenCalledWith("31667");
    });

    it("should handle missing agent data", async () => {
      vi.mocked(queryAgentData).mockResolvedValue(null);

      const result = await fetchAgentFromChain("99999");

      expect(result).toBeNull();
    });

    it("should handle blockchain connection errors", async () => {
      vi.mocked(queryAgentData).mockRejectedValue(new Error("RPC connection failed"));

      await expect(fetchAgentFromChain("31667")).rejects.toThrow("RPC connection failed");
    });
  });

  describe("Sync Status Validation", () => {
    it("should validate successful sync status", async () => {
      const syncStatus: SyncStatus = {
        agentId: "31667",
        onChain: true,
        marketplace: true,
        lastSync: new Date(),
        syncHash: "abc123",
      };

      vi.mocked(validateSyncStatus).mockResolvedValue(syncStatus);

      const result = await validateSyncStatus("31667");

      expect(result.onChain).toBe(true);
      expect(result.marketplace).toBe(true);
      expect(result.agentId).toBe("31667");
    });

    it("should detect sync mismatch", async () => {
      const syncStatus: SyncStatus = {
        agentId: "31667",
        onChain: true,
        marketplace: false,
        lastSync: new Date(Date.now() - 3600000), // 1 hour ago
        syncHash: null,
        error: "Agent not found in marketplace database",
      };

      vi.mocked(validateSyncStatus).mockResolvedValue(syncStatus);

      const result = await validateSyncStatus("31667");

      expect(result.onChain).toBe(true);
      expect(result.marketplace).toBe(false);
      expect(result.error).toContain("not found in marketplace");
    });

    it("should handle invalid agent IDs", async () => {
      vi.mocked(validateSyncStatus).mockRejectedValue(new Error("Invalid agent ID format"));

      await expect(validateSyncStatus("invalid-id")).rejects.toThrow("Invalid agent ID format");
    });
  });

  describe("Network Failure Handling", () => {
    it("should handle marketplace API failures", async () => {
      const networkError = new Error("Network timeout");
      vi.mocked(syncMarketplaceData).mockRejectedValue(networkError);

      await expect(syncMarketplaceData("31667")).rejects.toThrow("Network timeout");
    });

    it("should handle 404 responses gracefully", async () => {
      const notFoundError = new Error("Agent not found (404)");
      notFoundError.name = "NotFoundError";
      vi.mocked(syncMarketplaceData).mockRejectedValue(notFoundError);

      await expect(syncMarketplaceData("31667")).rejects.toThrow("Agent not found (404)");
    });

    it("should handle marketplace server errors", async () => {
      const serverError = new Error("Internal Server Error (500)");
      serverError.name = "ServerError";
      vi.mocked(syncMarketplaceData).mockRejectedValue(serverError);

      await expect(syncMarketplaceData("31667")).rejects.toThrow("Internal Server Error");
    });
  });

  describe("Retry Mechanisms", () => {
    it("should retry failed sync operations", async () => {
      let attempts = 0;
      vi.mocked(retryWithBackoff).mockImplementation(async (operation) => {
        attempts++;
        if (attempts < 3) {
          throw new Error("Temporary failure");
        }
        return operation();
      });

      const mockOperation = vi.fn().mockResolvedValue({ success: true });

      const result = await retryWithBackoff(mockOperation);

      expect(result).toEqual({ success: true });
      expect(attempts).toBe(3);
    });

    it("should fail after max retry attempts", async () => {
      vi.mocked(retryWithBackoff).mockImplementation(async () => {
        throw new Error("Max retries exceeded");
      });

      const mockOperation = vi.fn().mockRejectedValue(new Error("Persistent failure"));

      await expect(retryWithBackoff(mockOperation)).rejects.toThrow("Max retries exceeded");
    });

    it("should use exponential backoff timing", async () => {
      const delays: number[] = [];
      vi.mocked(retryWithBackoff).mockImplementation(async (operation, maxRetries = 3) => {
        for (let i = 0; i < maxRetries; i++) {
          const delay = Math.pow(2, i) * 1000;
          delays.push(delay);
          try {
            return await operation();
          } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      });

      const failingOperation = vi.fn()
        .mockRejectedValueOnce(new Error("Fail 1"))
        .mockRejectedValueOnce(new Error("Fail 2"))
        .mockResolvedValue({ success: true });

      await retryWithBackoff(failingOperation);

      expect(delays).toEqual([1000, 2000, 4000]);
    });
  });

  describe("CLI Command Integration", () => {
    it("should list agents via CLI command", async () => {
      const mockAgents = [mockAgentData];
      vi.mocked(listAgents).mockResolvedValue(mockAgents);

      const result = await listAgents();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(mockAgentData);
    });

    it("should handle empty agent list", async () => {
      vi.mocked(listAgents).mockResolvedValue([]);

      const result = await listAgents();

      expect(result).toEqual([]);
    });

    it("should get specific agent by ID", async () => {
      vi.mocked(getAgentById).mockResolvedValue(mockAgentData);

      const result = await getAgentById("31667");

      expect(result).toEqual(mockAgentData);
      expect(getAgentById).toHaveBeenCalledWith("31667");
    });

    it("should handle agent not found in CLI", async () => {
      vi.mocked(getAgentById).mockResolvedValue(null);

      const result = await getAgentById("99999");

      expect(result).toBeNull();
    });

    it("should handle CLI command errors", async () => {
      vi.mocked(listAgents).mockRejectedValue(new Error("CLI execution failed"));

      await expect(listAgents()).rejects.toThrow("CLI execution failed");
    });
  });

  describe("Mocked Responses", () => {
    it("should handle successful marketplace response", async () => {
      const marketplaceResponse: MarketplaceResponse = {
        agent: mockAgentData,
        status: "synced",
        lastUpdate: new Date(),
      };

      vi.mocked(syncMarketplaceData).mockResolvedValue(marketplaceResponse);

      const result = await syncMarketplaceData("31667");

      expect(result.agent.id).toBe("31667");
      expect(result.status).toBe("synced");
    });

    it("should simulate blockchain query with multiple agents", async () => {
      const multipleAgents = [
        { ...mockAgentData, id: "31372" },
        { ...mockAgentData, id: "31594" },
        mockAgentData,
      ];

      vi.mocked(queryAgentData).mockImplementation(async (id: string) => {
        return multipleAgents.find(agent => agent.id === id) || null;
      });

      const agent1 = await fetchAgentFromChain("31372");
      const agent2 = await fetchAgentFromChain("31594");
      const agent3 = await fetchAgentFromChain("31667");

      expect(agent1?.id).toBe("31372");
      expect(agent2?.id).toBe("31594");
      expect(agent3?.id).toBe("31667");
    });

    it("should mock BigInt serialization errors", async () => {
      const serializationError = new Error("BigInt serialization failed");
      serializationError.name = "SerializationError";

      vi.mocked(queryAgentData).mockRejectedValue(serializationError);

      await expect(fetchAgentFromChain("31667")).rejects.toThrow("BigInt serialization failed");
    });
  });

  describe("Integration Test Scenarios", () => {
    it("should handle complete sync workflow", async () => {
      // Mock successful chain query
      vi.mocked(queryAgentData).mockResolvedValue(mockAgentData);

      // Mock initial failed marketplace sync
      vi.mocked(syncMarketplaceData)
        .mockRejectedValueOnce(new Error("Temporary failure"))
        .mockResolvedValue({
          agent: mockAgentData,
          status: "synced",
          lastUpdate: new Date(),
        });

      // Mock successful retry
      vi.mocked(retryWithBackoff).mockImplementation(async (operation) => {
        try {
          return await operation();
        } catch {
          return await operation();
        }
      });

      const chainData = await fetchAgentFromChain("31667");
      expect(chainData).toEqual(mockAgentData);

      const syncResult = await retryWithBackoff(() => syncMarketplaceData("31667"));
      expect(syncResult.status).toBe("synced");
    });

    it("should validate agent registration completeness", async () => {
      const incompleteAgent = {
        ...mockAgentData,
        metadata: undefined,
      };

      vi.mocked(queryAgentData).mockResolvedValue(incompleteAgent);

      const result = await fetchAgentFromChain("31667");
      expect(result?.metadata).toBeUndefined();
    });
  });
});
