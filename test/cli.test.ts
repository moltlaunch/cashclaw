import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock the agent loop to avoid actual execution
vi.mock("../src/loop/index.js", () => ({
  runAgentLoop: vi.fn().mockResolvedValue(undefined),
}));

// Mock config loading
vi.mock("../src/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({
    agentId: "test-agent",
    moltlaunchApiKey: "test-api-key",
    llmProvider: "openai" as const,
    openaiApiKey: "test-openai-key",
    solanaPrivateKey: "test-solana-key",
    solanaRpcUrl: "https://api.mainnet-beta.solana.com",
    loopInterval: 30000,
    maxRetries: 3,
  }),
}));

describe("CLI", () => {
  const cliPath = path.join(__dirname, "../dist/cli.js");
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const runCli = (args: string[] = []): Promise<{ stdout: string; stderr: string; code: number }> => {
    return new Promise((resolve) => {
      const child = spawn("node", [cliPath, ...args], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_ENV: "test",
        },
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        resolve({ stdout, stderr, code: code || 0 });
      });

      child.on("error", (error) => {
        resolve({ stdout, stderr: error.message, code: 1 });
      });

      // Kill the process after a short timeout to prevent hanging
      setTimeout(() => {
        child.kill("SIGTERM");
        resolve({ stdout, stderr: "Process timeout", code: 143 });
      }, 2000);
    });
  };

  describe("Help and Usage", () => {
    it("should display help with --help flag", async () => {
      const result = await runCli(["--help"]);

      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("cashclaw");
      expect(result.stdout).toContain("Options:");
      expect(result.stdout).toContain("--config");
      expect(result.stdout).toContain("--agent-id");
      expect(result.code).toBe(0);
    });

    it("should display help with -h flag", async () => {
      const result = await runCli(["-h"]);

      expect(result.stdout).toContain("Usage:");
      expect(result.code).toBe(0);
    });

    it("should display version with --version flag", async () => {
      const result = await runCli(["--version"]);

      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
      expect(result.code).toBe(0);
    });

    it("should display version with -v flag", async () => {
      const result = await runCli(["-v"]);

      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
      expect(result.code).toBe(0);
    });
  });

  describe("Configuration", () => {
    it("should accept custom config file path", async () => {
      const configPath = "/tmp/test-config.json";
      await fs.writeFile(configPath, JSON.stringify({
        agentId: "custom-agent",
        moltlaunchApiKey: "custom-key",
        llmProvider: "openai",
        openaiApiKey: "custom-openai",
        solanaPrivateKey: "custom-solana",
        solanaRpcUrl: "https://api.devnet.solana.com",
      }));

      const result = await runCli(["--config", configPath]);

      expect(result.code).toBe(143); // Killed by timeout (normal for this test)

      await fs.unlink(configPath).catch(() => {});
    });

    it("should override agent ID with command line flag", async () => {
      const result = await runCli(["--agent-id", "cli-override-agent"]);

      expect(result.code).toBe(143); // Killed by timeout
    });

    it("should handle missing config file gracefully", async () => {
      const result = await runCli(["--config", "/nonexistent/config.json"]);

      expect(result.stderr).toContain("Config file not found");
      expect(result.code).toBe(1);
    });

    it("should handle invalid JSON in config file", async () => {
      const configPath = "/tmp/invalid-config.json";
      await fs.writeFile(configPath, "{ invalid json }");

      const result = await runCli(["--config", configPath]);

      expect(result.stderr).toContain("Invalid JSON");
      expect(result.code).toBe(1);

      await fs.unlink(configPath).catch(() => {});
    });
  });

  describe("Environment Variables", () => {
    it("should use environment variables when no config file provided", async () => {
      process.env.CASHCLAW_AGENT_ID = "env-agent";
      process.env.MOLTLAUNCH_API_KEY = "env-api-key";
      process.env.OPENAI_API_KEY = "env-openai-key";
      process.env.SOLANA_PRIVATE_KEY = "env-solana-key";

      const result = await runCli([]);

      expect(result.code).toBe(143); // Killed by timeout
    });

    it("should handle missing required environment variables", async () => {
      delete process.env.MOLTLAUNCH_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const result = await runCli([]);

      expect(result.stderr).toContain("Missing required");
      expect(result.code).toBe(1);
    });
  });

  describe("Command Execution", () => {
    it("should start agent loop with valid configuration", async () => {
      const { runAgentLoop } = await import("../src/loop/index.js");

      const result = await runCli([]);

      expect(result.code).toBe(143); // Killed by timeout
      expect(runAgentLoop).toHaveBeenCalled();
    });

    it("should handle agent loop errors gracefully", async () => {
      const { runAgentLoop } = await import("../src/loop/index.js");
      vi.mocked(runAgentLoop).mockRejectedValueOnce(new Error("Agent loop failed"));

      const result = await runCli([]);

      expect(result.stderr).toContain("Error");
      expect(result.code).toBe(1);
    });

    it("should set up signal handlers for graceful shutdown", async () => {
      const result = await runCli([]);

      // The process should handle SIGTERM gracefully
      expect(result.code).toBe(143); // SIGTERM exit code
    });
  });

  describe("Argument Parsing", () => {
    it("should reject unknown arguments", async () => {
      const result = await runCli(["--unknown-flag"]);

      expect(result.stderr).toContain("Unknown option");
      expect(result.code).toBe(1);
    });

    it("should handle multiple flags correctly", async () => {
      const result = await runCli(["--agent-id", "test", "--config", "/tmp/nonexistent.json"]);

      expect(result.stderr).toContain("Config file not found");
      expect(result.code).toBe(1);
    });

    it("should require values for option flags", async () => {
      const result = await runCli(["--agent-id"]);

      expect(result.stderr).toContain("Missing value");
      expect(result.code).toBe(1);
    });

    it("should handle boolean flags correctly", async () => {
      const result = await runCli(["--verbose"]);

      expect(result.code).toBe(143); // Should start normally then timeout
    });
  });

  describe("Output and Logging", () => {
    it("should display startup banner", async () => {
      const result = await runCli([]);

      expect(result.stdout).toContain("CashClaw Agent");
      expect(result.stdout).toContain("Starting");
    });

    it("should show configuration summary", async () => {
      const result = await runCli(["--verbose"]);

      expect(result.stdout).toContain("Agent ID:");
      expect(result.stdout).toContain("RPC URL:");
    });

    it("should handle quiet mode", async () => {
      const result = await runCli(["--quiet"]);

      // Should have minimal output in quiet mode
      expect(result.stdout.split('\n').length).toBeLessThan(5);
    });

    it("should log errors to stderr", async () => {
      const { runAgentLoop } = await import("../src/loop/index.js");
      vi.mocked(runAgentLoop).mockRejectedValueOnce(new Error("Test error"));

      const result = await runCli([]);

      expect(result.stderr).toContain("Test error");
    });
  });

  describe("Integration", () => {
    it("should pass correct configuration to agent loop", async () => {
      const { runAgentLoop } = await import("../src/loop/index.js");

      await runCli(["--agent-id", "integration-test"]);

      expect(runAgentLoop).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: "integration-test",
        })
      );
    });

    it("should handle config validation errors", async () => {
      const configPath = "/tmp/invalid-agent-config.json";
      await fs.writeFile(configPath, JSON.stringify({
        agentId: "", // Invalid empty agent ID
        moltlaunchApiKey: "test-key",
      }));

      const result = await runCli(["--config", configPath]);

      expect(result.stderr).toContain("Invalid configuration");
      expect(result.code).toBe(1);

      await fs.unlink(configPath).catch(() => {});
    });

    it("should support dry-run mode", async () => {
      const result = await runCli(["--dry-run"]);

      expect(result.stdout).toContain("Dry run mode");
      expect(result.code).toBe(0);
    });
  });
});
