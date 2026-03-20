import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// Mock filesystem operations
vi.mock("fs", () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("path", () => ({
  resolve: vi.fn(),
  join: vi.fn((...args) => args.join("/")),
}));

// Mock environment variables
const mockEnv = {
  SOLANA_RPC_URL: "https://api.mainnet-beta.solana.com",
  PRIVATE_KEY: "mock_private_key_base58",
  MOLTLAUNCH_API_KEY: "mock_api_key",
  NODE_ENV: "test",
};

describe("Startup Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockEnv).forEach(key => {
      process.env[key] = mockEnv[key];
    });
  });

  afterEach(() => {
    Object.keys(mockEnv).forEach(key => {
      delete process.env[key];
    });
  });

  describe("Configuration Validation", () => {
    it("should validate required environment variables", async () => {
      const { validateConfig } = await import("../src/config.js");

      expect(() => validateConfig()).not.toThrow();
    });

    it("should throw error when SOLANA_RPC_URL is missing", async () => {
      delete process.env.SOLANA_RPC_URL;

      const { validateConfig } = await import("../src/config.js");

      expect(() => validateConfig()).toThrow("Missing required environment variable: SOLANA_RPC_URL");
    });

    it("should throw error when PRIVATE_KEY is missing", async () => {
      delete process.env.PRIVATE_KEY;

      const { validateConfig } = await import("../src/config.js");

      expect(() => validateConfig()).toThrow("Missing required environment variable: PRIVATE_KEY");
    });

    it("should throw error when MOLTLAUNCH_API_KEY is missing", async () => {
      delete process.env.MOLTLAUNCH_API_KEY;

      const { validateConfig } = await import("../src/config.js");

      expect(() => validateConfig()).toThrow("Missing required environment variable: MOLTLAUNCH_API_KEY");
    });

    it("should validate RPC URL format", async () => {
      process.env.SOLANA_RPC_URL = "invalid-url";

      const { validateConfig } = await import("../src/config.js");

      expect(() => validateConfig()).toThrow("Invalid SOLANA_RPC_URL format");
    });

    it("should validate private key format", async () => {
      process.env.PRIVATE_KEY = "invalid-key";

      const { validateConfig } = await import("../src/config.js");

      expect(() => validateConfig()).toThrow("Invalid PRIVATE_KEY format");
    });
  });

  describe("Dependency Checks", () => {
    it("should check if package.json exists", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        name: "cashclaw",
        version: "1.0.0",
        dependencies: {
          "@solana/web3.js": "^1.78.0",
          "axios": "^1.5.0"
        }
      }));

      const { checkDependencies } = await import("../src/startup/dependencies.js");

      await expect(checkDependencies()).resolves.not.toThrow();
    });

    it("should throw error if package.json is missing", async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const { checkDependencies } = await import("../src/startup/dependencies.js");

      await expect(checkDependencies()).rejects.toThrow("package.json not found");
    });

    it("should validate required dependencies", async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        name: "cashclaw",
        version: "1.0.0",
        dependencies: {}
      }));

      const { checkDependencies } = await import("../src/startup/dependencies.js");

      await expect(checkDependencies()).rejects.toThrow("Missing required dependency: @solana/web3.js");
    });
  });

  describe("Solana Connection Validation", () => {
    it("should validate Solana RPC connection", async () => {
      const mockConnection = {
        getVersion: vi.fn().mockResolvedValue({ "solana-core": "1.16.0" }),
        getSlot: vi.fn().mockResolvedValue(123456),
      };

      vi.doMock("@solana/web3.js", () => ({
        Connection: vi.fn(() => mockConnection),
        clusterApiUrl: vi.fn(() => "https://api.mainnet-beta.solana.com"),
      }));

      const { validateSolanaConnection } = await import("../src/startup/solana.js");

      await expect(validateSolanaConnection()).resolves.not.toThrow();
    });

    it("should handle Solana connection timeout", async () => {
      const mockConnection = {
        getVersion: vi.fn().mockRejectedValue(new Error("Network timeout")),
      };

      vi.doMock("@solana/web3.js", () => ({
        Connection: vi.fn(() => mockConnection),
      }));

      const { validateSolanaConnection } = await import("../src/startup/solana.js");

      await expect(validateSolanaConnection()).rejects.toThrow("Failed to connect to Solana RPC");
    });

    it("should validate wallet keypair", async () => {
      const mockKeypair = {
        publicKey: { toBase58: () => "MockPublicKey123" },
        secretKey: new Uint8Array(64),
      };

      vi.doMock("@solana/web3.js", () => ({
        Keypair: {
          fromSecretKey: vi.fn(() => mockKeypair),
        },
      }));

      const { validateWallet } = await import("../src/startup/wallet.js");

      expect(() => validateWallet()).not.toThrow();
    });

    it("should handle invalid wallet keypair", async () => {
      vi.doMock("@solana/web3.js", () => ({
        Keypair: {
          fromSecretKey: vi.fn(() => {
            throw new Error("Invalid private key");
          }),
        },
      }));

      const { validateWallet } = await import("../src/startup/wallet.js");

      expect(() => validateWallet()).toThrow("Invalid wallet private key");
    });
  });

  describe("Error Handling and Recovery", () => {
    it("should handle startup failure gracefully", async () => {
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const processExitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("Process exit called");
      });

      delete process.env.SOLANA_RPC_URL;

      const { startupApp } = await import("../src/startup/index.js");

      await expect(startupApp()).rejects.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith("Startup failed:", expect.any(Error));
      expect(processExitSpy).toHaveBeenCalledWith(1);

      consoleSpy.mockRestore();
      processExitSpy.mockRestore();
    });

    it("should attempt recovery on network errors", async () => {
      const retryCount = 3;
      let attempts = 0;

      const mockConnection = {
        getVersion: vi.fn().mockImplementation(() => {
          attempts++;
          if (attempts < retryCount) {
            return Promise.reject(new Error("Network error"));
          }
          return Promise.resolve({ "solana-core": "1.16.0" });
        }),
        getSlot: vi.fn().mockResolvedValue(123456),
      };

      vi.doMock("@solana/web3.js", () => ({
        Connection: vi.fn(() => mockConnection),
      }));

      const { validateSolanaConnectionWithRetry } = await import("../src/startup/solana.js");

      await expect(validateSolanaConnectionWithRetry(retryCount)).resolves.not.toThrow();
      expect(attempts).toBe(retryCount);
    });

    it("should fail after maximum retry attempts", async () => {
      const maxRetries = 2;

      const mockConnection = {
        getVersion: vi.fn().mockRejectedValue(new Error("Persistent network error")),
      };

      vi.doMock("@solana/web3.js", () => ({
        Connection: vi.fn(() => mockConnection),
      }));

      const { validateSolanaConnectionWithRetry } = await import("../src/startup/solana.js");

      await expect(validateSolanaConnectionWithRetry(maxRetries))
        .rejects.toThrow("Failed to connect after 2 attempts");
    });

    it("should log startup progress", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        name: "cashclaw",
        dependencies: { "@solana/web3.js": "^1.78.0", "axios": "^1.5.0" }
      }));

      const mockConnection = {
        getVersion: vi.fn().mockResolvedValue({ "solana-core": "1.16.0" }),
        getSlot: vi.fn().mockResolvedValue(123456),
      };

      vi.doMock("@solana/web3.js", () => ({
        Connection: vi.fn(() => mockConnection),
      }));

      const { startupApp } = await import("../src/startup/index.js");

      await startupApp();

      expect(consoleSpy).toHaveBeenCalledWith("🚀 Starting CashClaw...");
      expect(consoleSpy).toHaveBeenCalledWith("✅ Configuration validated");
      expect(consoleSpy).toHaveBeenCalledWith("✅ Dependencies checked");
      expect(consoleSpy).toHaveBeenCalledWith("✅ Solana connection established");
      expect(consoleSpy).toHaveBeenCalledWith("🎯 CashClaw started successfully");

      consoleSpy.mockRestore();
    });
  });

  describe("Moltlaunch API Validation", () => {
    it("should validate API connection", async () => {
      const mockAxios = {
        get: vi.fn().mockResolvedValue({
          status: 200,
          data: { status: "healthy" }
        })
      };

      vi.doMock("axios", () => ({
        default: mockAxios,
        create: () => mockAxios,
      }));

      const { validateMoltlaunchAPI } = await import("../src/startup/api.js");

      await expect(validateMoltlaunchAPI()).resolves.not.toThrow();
    });

    it("should handle API connection failure", async () => {
      const mockAxios = {
        get: vi.fn().mockRejectedValue(new Error("API unreachable"))
      };

      vi.doMock("axios", () => ({
        default: mockAxios,
        create: () => mockAxios,
      }));

      const { validateMoltlaunchAPI } = await import("../src/startup/api.js");

      await expect(validateMoltlaunchAPI()).rejects.toThrow("Moltlaunch API connection failed");
    });
  });
});
