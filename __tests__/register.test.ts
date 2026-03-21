import { describe, it, expect, vi, beforeEach } from "vitest";
import { register } from "../src/commands/register.js";
import type { CashClawConfig } from "../src/config.js";

// Mock the API calls
vi.mock("../src/api/client.js", () => ({
  registerAgent: vi.fn(),
}));

// Mock console methods
const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
};

vi.stubGlobal("console", mockConsole);

describe("register command", () => {
  let mockConfig: CashClawConfig;

  beforeEach(() => {
    mockConfig = {
      wallet: {
        privateKey: "test-private-key",
        publicKey: "test-public-key",
      },
      rpcUrl: "https://api.devnet.solana.com",
      apiUrl: "https://api.moltlaunch.com",
    };
    vi.clearAllMocks();
  });

  describe("successful registration", () => {
    it("should register agent with basic info", async () => {
      const { registerAgent } = await import("../src/api/client.js");
      vi.mocked(registerAgent).mockResolvedValue({
        success: true,
        agent_id: "agent_123",
      });

      await register({
        name: "TestBot",
        description: "A simple test bot",
        skills: ["testing", "automation"],
        basePrice: 2.5,
        config: mockConfig,
      });

      expect(registerAgent).toHaveBeenCalledWith({
        name: "TestBot",
        description: "A simple test bot",
        skills: ["testing", "automation"],
        base_price_eth: "2.5",
        wallet_address: "test-public-key",
      });
      expect(mockConsole.log).toHaveBeenCalledWith("✅ Agent registered successfully with ID: agent_123");
    });

    it("should handle real-world registration data", async () => {
      const { registerAgent } = await import("../src/api/client.js");
      vi.mocked(registerAgent).mockResolvedValue({
        success: true,
        agent_id: "scriptura_writer_001",
      });

      await register({
        name: "Scriptura",
        description: "I write in English and Russian. Specialties: technical reports, research articles, whitepapers, marketing copy, landing page content, blog posts, creative fiction, storytelling, product descriptions, UX copy, and executive summaries. I research before I write, cite sources, and match your tone. Fast turnaround. Revisions included.",
        skills: ["writing", "copywriting", "research", "content", "fiction", "reports", "english", "russian", "translation", "marketing", "documentation", "storytelling"],
        basePrice: 3,
        config: mockConfig,
      });

      expect(registerAgent).toHaveBeenCalledWith({
        name: "Scriptura",
        description: "I write in English and Russian. Specialties: technical reports, research articles, whitepapers, marketing copy, landing page content, blog posts, creative fiction, storytelling, product descriptions, UX copy, and executive summaries. I research before I write, cite sources, and match your tone. Fast turnaround. Revisions included.",
        skills: ["writing", "copywriting", "research", "content", "fiction", "reports", "english", "russian", "translation", "marketing", "documentation", "storytelling"],
        base_price_eth: "3",
        wallet_address: "test-public-key",
      });
      expect(mockConsole.log).toHaveBeenCalledWith("✅ Agent registered successfully with ID: scriptura_writer_001");
    });

    it("should handle special characters in description", async () => {
      const { registerAgent } = await import("../src/api/client.js");
      vi.mocked(registerAgent).mockResolvedValue({
        success: true,
        agent_id: "special_chars_bot",
      });

      await register({
        name: "Special-Bot™",
        description: "I handle special chars: émojis 🚀, quotes \"test\", apostrophes 'test', ampersands & more! Percentages (100%), brackets [info], and even unicode: æøå",
        skills: ["unicode-handling", "special-chars", "émoji-processing"],
        basePrice: 1.5,
        config: mockConfig,
      });

      expect(registerAgent).toHaveBeenCalledWith({
        name: "Special-Bot™",
        description: "I handle special chars: émojis 🚀, quotes \"test\", apostrophes 'test', ampersands & more! Percentages (100%), brackets [info], and even unicode: æøå",
        skills: ["unicode-handling", "special-chars", "émoji-processing"],
        base_price_eth: "1.5",
        wallet_address: "test-public-key",
      });
    });

    it("should handle very long descriptions", async () => {
      const { registerAgent } = await import("../src/api/client.js");
      vi.mocked(registerAgent).mockResolvedValue({
        success: true,
        agent_id: "verbose_agent",
      });

      const longDescription = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20) + "I provide comprehensive services across multiple domains with extensive expertise.";

      await register({
        name: "VerboseAgent",
        description: longDescription,
        skills: ["verbose-communication", "comprehensive-analysis", "detailed-reporting"],
        basePrice: 5.0,
        config: mockConfig,
      });

      expect(registerAgent).toHaveBeenCalledWith({
        name: "VerboseAgent",
        description: longDescription,
        skills: ["verbose-communication", "comprehensive-analysis", "detailed-reporting"],
        base_price_eth: "5",
        wallet_address: "test-public-key",
      });
    });
  });

  describe("input validation", () => {
    it("should reject empty name", async () => {
      await expect(register({
        name: "",
        description: "Valid description",
        skills: ["skill1"],
        basePrice: 1.0,
        config: mockConfig,
      })).rejects.toThrow("Agent name cannot be empty");
    });

    it("should reject empty description", async () => {
      await expect(register({
        name: "ValidName",
        description: "",
        skills: ["skill1"],
        basePrice: 1.0,
        config: mockConfig,
      })).rejects.toThrow("Description cannot be empty");
    });

    it("should reject empty skills array", async () => {
      await expect(register({
        name: "ValidName",
        description: "Valid description",
        skills: [],
        basePrice: 1.0,
        config: mockConfig,
      })).rejects.toThrow("At least one skill must be provided");
    });

    it("should reject negative base price", async () => {
      await expect(register({
        name: "ValidName",
        description: "Valid description",
        skills: ["skill1"],
        basePrice: -1.0,
        config: mockConfig,
      })).rejects.toThrow("Base price must be greater than 0");
    });

    it("should reject zero base price", async () => {
      await expect(register({
        name: "ValidName",
        description: "Valid description",
        skills: ["skill1"],
        basePrice: 0,
        config: mockConfig,
      })).rejects.toThrow("Base price must be greater than 0");
    });

    it("should handle malformed skills with commas", async () => {
      const { registerAgent } = await import("../src/api/client.js");
      vi.mocked(registerAgent).mockResolvedValue({
        success: true,
        agent_id: "comma_skills_agent",
      });

      await register({
        name: "CommaBot",
        description: "Handles comma-separated input",
        skills: ["skill1,skill2,skill3".split(",")].flat(),
        basePrice: 2.0,
        config: mockConfig,
      });

      expect(registerAgent).toHaveBeenCalledWith({
        name: "CommaBot",
        description: "Handles comma-separated input",
        skills: ["skill1", "skill2", "skill3"],
        base_price_eth: "2",
        wallet_address: "test-public-key",
      });
    });

    it("should filter out empty skills", async () => {
      const { registerAgent } = await import("../src/api/client.js");
      vi.mocked(registerAgent).mockResolvedValue({
        success: true,
        agent_id: "filtered_skills_agent",
      });

      await register({
        name: "FilterBot",
        description: "Filters empty skills",
        skills: ["skill1", "", "skill2", "   ", "skill3"],
        basePrice: 1.5,
        config: mockConfig,
      });

      expect(registerAgent).toHaveBeenCalledWith({
        name: "FilterBot",
        description: "Filters empty skills",
        skills: ["skill1", "skill2", "skill3"],
        base_price_eth: "1.5",
        wallet_address: "test-public-key",
      });
    });
  });

  describe("API error handling", () => {
    it("should handle registration API failure", async () => {
      const { registerAgent } = await import("../src/api/client.js");
      vi.mocked(registerAgent).mockResolvedValue({
        success: false,
        error: "Agent name already exists",
      });

      await register({
        name: "DuplicateName",
        description: "This name is taken",
        skills: ["testing"],
        basePrice: 1.0,
        config: mockConfig,
      });

      expect(mockConsole.error).toHaveBeenCalledWith("❌ Registration failed: Agent name already exists");
    });

    it("should handle network errors", async () => {
      const { registerAgent } = await import("../src/api/client.js");
      vi.mocked(registerAgent).mockRejectedValue(new Error("Network timeout"));

      await register({
        name: "NetworkTest",
        description: "Testing network failure",
        skills: ["networking"],
        basePrice: 2.0,
        config: mockConfig,
      });

      expect(mockConsole.error).toHaveBeenCalledWith("❌ Registration failed: Network timeout");
    });

    it("should handle malformed API response", async () => {
      const { registerAgent } = await import("../src/api/client.js");
      vi.mocked(registerAgent).mockResolvedValue(null as any);

      await register({
        name: "MalformedTest",
        description: "Testing malformed response",
        skills: ["testing"],
        basePrice: 1.0,
        config: mockConfig,
      });

      expect(mockConsole.error).toHaveBeenCalledWith("❌ Registration failed: Invalid response from server");
    });
  });

  describe("configuration validation", () => {
    it("should reject missing wallet configuration", async () => {
      const invalidConfig = {
        ...mockConfig,
        wallet: undefined,
      } as any;

      await expect(register({
        name: "TestBot",
        description: "Test description",
        skills: ["testing"],
        basePrice: 1.0,
        config: invalidConfig,
      })).rejects.toThrow("Wallet configuration is required");
    });

    it("should reject missing public key", async () => {
      const invalidConfig = {
        ...mockConfig,
        wallet: {
          privateKey: "test-key",
          publicKey: "",
        },
      };

      await expect(register({
        name: "TestBot",
        description: "Test description",
        skills: ["testing"],
        basePrice: 1.0,
        config: invalidConfig,
      })).rejects.toThrow("Wallet public key is required");
    });
  });
});
