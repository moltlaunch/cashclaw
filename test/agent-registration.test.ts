import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CashClawConfig } from "../src/config.js";

interface AgentRegistration {
  id: string;
  agentIdBigInt: string;
  owner: string;
  agentURI: string;
  agentWallet: string;
  name: string;
  description: string;
  skills: string[];
  endpoint?: string;
  status?: "active" | "inactive" | "pending";
}

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details: Record<string, unknown>;
}

// Mock agent registration service
vi.mock("../src/agent/registry.js", () => ({
  validateAgentEndpoint: vi.fn(),
  verifyWalletConnection: vi.fn(),
  checkAgentConfiguration: vi.fn(),
  registerAgent: vi.fn(),
  getAgentStatus: vi.fn(),
}));

const mockConfig: CashClawConfig = {
  llm: {
    provider: "openai" as const,
    model: "gpt-4",
    temperature: 0.7,
  },
  agent: {
    name: "ViralThreader",
    description: "X & LinkedIn Ghostwriter",
    skills: ["copywriting", "trend analysis"],
    wallet: "0x1111111111111111111111111111111111111111",
    endpoint: "https://api.example.com/agent",
  },
  moltlaunch: {
    apiUrl: "https://api.moltlaunch.com",
    contractAddress: "0x7a43",
  },
};

const mockAgentData: AgentRegistration = {
  id: "0x7a43",
  agentIdBigInt: "31299",
  owner: "0x0000000000000000000000000000000000000000",
  agentURI: "data:application/json;base64,eyJuYW1lIjoiTW9jayBBZ2VudCIsImRlc2NyaXB0aW9uIjoiTW9jayBkZXNjcmlwdGlvbiJ9",
  agentWallet: "0x1111111111111111111111111111111111111111",
  name: "ViralThreader | X & LinkedIn Ghostwriter",
  description: "Your personal growth hacker. This agent specializes in turning raw ideas...",
  skills: ["copywriting", "trend analysis"],
  status: "pending",
};

describe("Agent Registration Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Endpoint Validation", () => {
    it("should validate agent endpoint availability", async () => {
      const { validateAgentEndpoint } = await import("../src/agent/registry.js");

      vi.mocked(validateAgentEndpoint).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        details: { responseTime: 150, status: 200 },
      });

      const result = await validateAgentEndpoint(mockConfig.agent.endpoint!);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.details.status).toBe(200);
    });

    it("should detect unreachable endpoint", async () => {
      const { validateAgentEndpoint } = await import("../src/agent/registry.js");

      vi.mocked(validateAgentEndpoint).mockResolvedValue({
        isValid: false,
        errors: ["Endpoint unreachable: Connection timeout"],
        warnings: [],
        details: { error: "ECONNREFUSED" },
      });

      const result = await validateAgentEndpoint("https://invalid-endpoint.com");

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Endpoint unreachable: Connection timeout");
    });

    it("should warn about slow response times", async () => {
      const { validateAgentEndpoint } = await import("../src/agent/registry.js");

      vi.mocked(validateAgentEndpoint).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: ["Slow response time: 3500ms"],
        details: { responseTime: 3500, status: 200 },
      });

      const result = await validateAgentEndpoint(mockConfig.agent.endpoint!);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain("Slow response time: 3500ms");
    });
  });

  describe("Wallet Verification", () => {
    it("should verify wallet connection and ownership", async () => {
      const { verifyWalletConnection } = await import("../src/agent/registry.js");

      vi.mocked(verifyWalletConnection).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        details: {
          address: mockConfig.agent.wallet,
          balance: "0.5",
          isConnected: true
        },
      });

      const result = await verifyWalletConnection(mockConfig.agent.wallet);

      expect(result.isValid).toBe(true);
      expect(result.details.isConnected).toBe(true);
      expect(result.details.address).toBe(mockConfig.agent.wallet);
    });

    it("should detect invalid wallet format", async () => {
      const { verifyWalletConnection } = await import("../src/agent/registry.js");

      vi.mocked(verifyWalletConnection).mockResolvedValue({
        isValid: false,
        errors: ["Invalid wallet address format"],
        warnings: [],
        details: { address: "invalid-wallet" },
      });

      const result = await verifyWalletConnection("invalid-wallet");

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid wallet address format");
    });

    it("should detect zero address as owner", async () => {
      const { verifyWalletConnection } = await import("../src/agent/registry.js");

      vi.mocked(verifyWalletConnection).mockResolvedValue({
        isValid: false,
        errors: ["Agent owner is zero address - registration incomplete"],
        warnings: [],
        details: {
          address: "0x0000000000000000000000000000000000000000",
          isZeroAddress: true
        },
      });

      const result = await verifyWalletConnection("0x0000000000000000000000000000000000000000");

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Agent owner is zero address - registration incomplete");
    });
  });

  describe("Configuration Validation", () => {
    it("should validate complete agent configuration", async () => {
      const { checkAgentConfiguration } = await import("../src/agent/registry.js");

      vi.mocked(checkAgentConfiguration).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        details: {
          hasName: true,
          hasDescription: true,
          hasSkills: true,
          hasEndpoint: true
        },
      });

      const result = await checkAgentConfiguration(mockConfig);

      expect(result.isValid).toBe(true);
      expect(result.details.hasName).toBe(true);
      expect(result.details.hasSkills).toBe(true);
    });

    it("should detect missing required fields", async () => {
      const { checkAgentConfiguration } = await import("../src/agent/registry.js");

      const incompleteConfig = {
        ...mockConfig,
        agent: {
          ...mockConfig.agent,
          name: "",
          description: "",
        },
      };

      vi.mocked(checkAgentConfiguration).mockResolvedValue({
        isValid: false,
        errors: [
          "Agent name is required",
          "Agent description is required"
        ],
        warnings: [],
        details: {
          hasName: false,
          hasDescription: false,
          hasSkills: true
        },
      });

      const result = await checkAgentConfiguration(incompleteConfig);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Agent name is required");
      expect(result.errors).toContain("Agent description is required");
    });

    it("should validate skills array", async () => {
      const { checkAgentConfiguration } = await import("../src/agent/registry.js");

      const configWithoutSkills = {
        ...mockConfig,
        agent: {
          ...mockConfig.agent,
          skills: [],
        },
      };

      vi.mocked(checkAgentConfiguration).mockResolvedValue({
        isValid: false,
        errors: ["At least one skill is required"],
        warnings: [],
        details: { hasSkills: false },
      });

      const result = await checkAgentConfiguration(configWithoutSkills);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("At least one skill is required");
    });
  });

  describe("Registration Status Check", () => {
    it("should check agent registration status", async () => {
      const { getAgentStatus } = await import("../src/agent/registry.js");

      vi.mocked(getAgentStatus).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: ["Agent is pending activation"],
        details: {
          status: "pending",
          registered: true,
          visible: false,
          agentId: "0x7a43"
        },
      });

      const result = await getAgentStatus(mockConfig.agent.wallet);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain("Agent is pending activation");
      expect(result.details.status).toBe("pending");
    });

    it("should detect unregistered agent", async () => {
      const { getAgentStatus } = await import("../src/agent/registry.js");

      vi.mocked(getAgentStatus).mockResolvedValue({
        isValid: false,
        errors: ["Agent not found in registry"],
        warnings: [],
        details: {
          status: "unregistered",
          registered: false,
          visible: false
        },
      });

      const result = await getAgentStatus("0x9999999999999999999999999999999999999999");

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Agent not found in registry");
      expect(result.details.registered).toBe(false);
    });
  });

  describe("Error Handling", () => {
    it("should handle network errors gracefully", async () => {
      const { validateAgentEndpoint } = await import("../src/agent/registry.js");

      vi.mocked(validateAgentEndpoint).mockRejectedValue(new Error("Network error"));

      try {
        await validateAgentEndpoint("https://network-error.com");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("Network error");
      }
    });

    it("should handle malformed agent data", async () => {
      const { checkAgentConfiguration } = await import("../src/agent/registry.js");

      vi.mocked(checkAgentConfiguration).mockResolvedValue({
        isValid: false,
        errors: ["Invalid configuration format"],
        warnings: [],
        details: { malformed: true },
      });

      const result = await checkAgentConfiguration(null as any);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Invalid configuration format");
    });
  });

  describe("Diagnostic Reporting", () => {
    it("should provide comprehensive diagnostic information", async () => {
      const { validateAgentEndpoint, verifyWalletConnection, checkAgentConfiguration } =
        await import("../src/agent/registry.js");

      // Mock all validation functions for comprehensive test
      vi.mocked(validateAgentEndpoint).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        details: { responseTime: 200, status: 200 },
      });

      vi.mocked(verifyWalletConnection).mockResolvedValue({
        isValid: false,
        errors: ["Agent owner is zero address - registration incomplete"],
        warnings: [],
        details: { isZeroAddress: true },
      });

      vi.mocked(checkAgentConfiguration).mockResolvedValue({
        isValid: true,
        errors: [],
        warnings: [],
        details: { hasName: true, hasDescription: true, hasSkills: true },
      });

      const endpointResult = await validateAgentEndpoint(mockConfig.agent.endpoint!);
      const walletResult = await verifyWalletConnection(mockAgentData.owner);
      const configResult = await checkAgentConfiguration(mockConfig);

      const diagnosticReport = {
        endpoint: endpointResult,
        wallet: walletResult,
        configuration: configResult,
        overallValid: endpointResult.isValid && walletResult.isValid && configResult.isValid,
      };

      expect(diagnosticReport.endpoint.isValid).toBe(true);
      expect(diagnosticReport.wallet.isValid).toBe(false);
      expect(diagnosticReport.configuration.isValid).toBe(true);
      expect(diagnosticReport.overallValid).toBe(false);
      expect(diagnosticReport.wallet.errors).toContain("Agent owner is zero address - registration incomplete");
    });

    it("should generate actionable error messages", async () => {
      const { getAgentStatus } = await import("../src/agent/registry.js");

      vi.mocked(getAgentStatus).mockResolvedValue({
        isValid: false,
        errors: [
          "Agent registration incomplete: zero address owner detected",
          "Complete registration by calling registerAgent() with valid owner address"
        ],
        warnings: [],
        details: {
          suggestedActions: [
            "Verify wallet connection",
            "Complete agent registration transaction",
            "Wait for blockchain confirmation"
          ]
        },
      });

      const result = await getAgentStatus(mockConfig.agent.wallet);

      expect(result.errors).toHaveLength(2);
      expect(result.details.suggestedActions).toHaveLength(3);
      expect(result.details.suggestedActions).toContain("Complete agent registration transaction");
    });
  });
});
