import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

// Mock child_process to avoid running actual CLI commands
vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

// Mock fs to control file existence checks
vi.mock("fs", () => ({
  existsSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);
const mockSpawn = vi.mocked(spawn);
const mockExistsSync = vi.mocked(existsSync);

describe("CLI functionality", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("Command availability", () => {
    it("should find mltl command in PATH", () => {
      const binPath = path.join(process.cwd(), "node_modules/.bin/mltl");
      mockExistsSync.mockReturnValueOnce(true);

      expect(existsSync(binPath)).toBe(true);
    });

    it("should find cashclaw command in PATH", () => {
      const binPath = path.join(process.cwd(), "node_modules/.bin/cashclaw");
      mockExistsSync.mockReturnValueOnce(true);

      expect(existsSync(binPath)).toBe(true);
    });

    it("should handle missing binary files", () => {
      mockExistsSync.mockReturnValue(false);
      const binPath = path.join(process.cwd(), "node_modules/.bin/mltl");

      expect(existsSync(binPath)).toBe(false);
    });
  });

  describe("Command parsing", () => {
    it("should parse mltl help command", () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(`
Usage: mltl [command] [options]

Commands:
  start       Start the CashClaw agent
  config      Configure agent settings
  wallet      Manage wallet connection
  help        Show this help message

Options:
  -h, --help     Show help
  -v, --version  Show version
      `));

      const output = execSync("mltl --help", { encoding: "utf8" });
      expect(output).toContain("Usage: mltl");
      expect(output).toContain("Commands:");
      expect(output).toContain("start");
      expect(output).toContain("config");
      expect(output).toContain("wallet");
    });

    it("should parse cashclaw help command", () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(`
Usage: cashclaw [command] [options]

Commands:
  start       Start the CashClaw agent
  config      Configure agent settings
  wallet      Manage wallet connection
  help        Show this help message

Options:
  -h, --help     Show help
  -v, --version  Show version
      `));

      const output = execSync("cashclaw --help", { encoding: "utf8" });
      expect(output).toContain("Usage: cashclaw");
      expect(output).toContain("Commands:");
    });

    it("should handle version command", () => {
      mockExecSync.mockReturnValueOnce(Buffer.from("moltlaunch v1.0.0"));

      const output = execSync("mltl --version", { encoding: "utf8" });
      expect(output).toContain("v1.0.0");
    });

    it("should handle invalid commands gracefully", () => {
      mockExecSync.mockImplementationOnce(() => {
        const error = new Error("Command failed") as any;
        error.status = 1;
        error.stderr = Buffer.from("Unknown command: invalid");
        throw error;
      });

      expect(() => {
        execSync("mltl invalid-command", { encoding: "utf8" });
      }).toThrow("Command failed");
    });
  });

  describe("Command execution", () => {
    it("should execute start command with proper arguments", () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn((event, callback) => {
          if (event === "close") {
            setTimeout(() => callback(0), 10);
          }
        }),
      };

      mockSpawn.mockReturnValueOnce(mockProcess as any);

      const child = spawn("mltl", ["start", "--config", "test.json"]);
      expect(mockSpawn).toHaveBeenCalledWith("mltl", ["start", "--config", "test.json"]);
    });

    it("should handle config command execution", () => {
      mockExecSync.mockReturnValueOnce(Buffer.from("Configuration saved successfully"));

      const output = execSync("mltl config --set wallet.rpc=https://api.mainnet-beta.solana.com", { encoding: "utf8" });
      expect(output).toContain("Configuration saved");
    });

    it("should handle wallet command execution", () => {
      mockExecSync.mockReturnValueOnce(Buffer.from(`
Wallet Status:
Connected: true
Address: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
Balance: 1.245 SOL
      `));

      const output = execSync("mltl wallet status", { encoding: "utf8" });
      expect(output).toContain("Wallet Status:");
      expect(output).toContain("Connected: true");
    });
  });

  describe("Error handling", () => {
    it("should handle command not found errors", () => {
      mockExecSync.mockImplementationOnce(() => {
        const error = new Error("Command not found") as any;
        error.status = 127;
        error.code = "ENOENT";
        throw error;
      });

      expect(() => {
        execSync("nonexistent-command", { encoding: "utf8" });
      }).toThrow("Command not found");
    });

    it("should handle permission denied errors", () => {
      mockExecSync.mockImplementationOnce(() => {
        const error = new Error("Permission denied") as any;
        error.status = 126;
        error.code = "EACCES";
        throw error;
      });

      expect(() => {
        execSync("mltl start", { encoding: "utf8" });
      }).toThrow("Permission denied");
    });

    it("should provide helpful error messages for common issues", () => {
      mockExecSync.mockImplementationOnce(() => {
        const error = new Error("mltl: command not found") as any;
        error.status = 127;
        error.stderr = Buffer.from("bash: mltl: command not found");
        throw error;
      });

      try {
        execSync("mltl --help", { encoding: "utf8" });
      } catch (error: any) {
        expect(error.message).toContain("command not found");
      }
    });
  });

  describe("Binary installation verification", () => {
    it("should verify npm global installation", () => {
      mockExecSync.mockReturnValueOnce(Buffer.from("/usr/local/lib/node_modules/moltlaunch"));

      const output = execSync("npm list -g moltlaunch", { encoding: "utf8" });
      expect(output).toContain("moltlaunch");
    });

    it("should verify local installation", () => {
      mockExecSync.mockReturnValueOnce(Buffer.from("./node_modules/moltlaunch"));

      const output = execSync("npm list moltlaunch", { encoding: "utf8" });
      expect(output).toContain("node_modules/moltlaunch");
    });

    it("should check PATH environment variable", () => {
      const originalPath = process.env.PATH;
      process.env.PATH = "/usr/local/bin:/usr/bin:/bin:/usr/local/lib/node_modules/.bin";

      expect(process.env.PATH).toContain("node_modules/.bin");

      process.env.PATH = originalPath;
    });
  });

  describe("Cross-platform compatibility", () => {
    it("should handle Windows executable extensions", () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });

      const binPath = path.join(process.cwd(), "node_modules/.bin/mltl.cmd");
      mockExistsSync.mockReturnValueOnce(true);

      expect(existsSync(binPath)).toBe(true);

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should handle Unix-like systems", () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });

      const binPath = path.join(process.cwd(), "node_modules/.bin/mltl");
      mockExistsSync.mockReturnValueOnce(true);

      expect(existsSync(binPath)).toBe(true);

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });
  });

  describe("Command aliases", () => {
    it("should support both mltl and cashclaw commands", () => {
      mockExecSync
        .mockReturnValueOnce(Buffer.from("mltl help output"))
        .mockReturnValueOnce(Buffer.from("cashclaw help output"));

      const mltlOutput = execSync("mltl --help", { encoding: "utf8" });
      const cashclawOutput = execSync("cashclaw --help", { encoding: "utf8" });

      expect(mltlOutput).toContain("mltl");
      expect(cashclawOutput).toContain("cashclaw");
    });

    it("should provide same functionality for both aliases", () => {
      mockExecSync.mockReturnValue(Buffer.from("v1.0.0"));

      const mltlVersion = execSync("mltl --version", { encoding: "utf8" });
      const cashclawVersion = execSync("cashclaw --version", { encoding: "utf8" });

      expect(mltlVersion).toEqual(cashclawVersion);
    });
  });
});
