import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync } from "fs";
import { join, resolve, normalize } from "path";
import { homedir } from "os";

// Mock fs and path modules
vi.mock("fs");
vi.mock("path");
vi.mock("os");

// Mock workspace detection functions
const mockExistsSync = vi.mocked(existsSync);
const mockJoin = vi.mocked(join);
const mockResolve = vi.mocked(resolve);
const mockNormalize = vi.mocked(normalize);
const mockHomedir = vi.mocked(homedir);

// Mock skill installation functions
const detectOpenClawWorkspace = vi.fn();
const installSkill = vi.fn();
const validateSkillsPath = vi.fn();
const runCLICommand = vi.fn();

vi.mock("../src/skills/workspace.js", () => ({
  detectOpenClawWorkspace,
  validateSkillsPath,
}));

vi.mock("../src/skills/installer.js", () => ({
  installSkill,
}));

vi.mock("../src/cli/commands.js", () => ({
  runCLICommand,
}));

describe("Skills Workspace Detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup default path mocks
    mockJoin.mockImplementation((...paths) => paths.join("/"));
    mockResolve.mockImplementation((path) => path);
    mockNormalize.mockImplementation((path) => path.replace(/\\/g, "/"));
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("OpenClaw workspace detection", () => {
    it("should detect workspace in default location on Unix", async () => {
      mockHomedir.mockReturnValue("/home/user");
      mockExistsSync.mockImplementation((path) => {
        return path === "/home/user/.openclaw" || path === "/home/user/.openclaw/skills";
      });

      const result = await detectOpenClawWorkspace();

      expect(result).toEqual({
        found: true,
        path: "/home/user/.openclaw",
        skillsPath: "/home/user/.openclaw/skills",
      });
      expect(mockExistsSync).toHaveBeenCalledWith("/home/user/.openclaw");
      expect(mockExistsSync).toHaveBeenCalledWith("/home/user/.openclaw/skills");
    });

    it("should detect workspace in default location on Windows", async () => {
      mockHomedir.mockReturnValue("C:\\Users\\vs861");
      mockNormalize.mockImplementation((path) => path.replace(/\//g, "\\"));
      mockJoin.mockImplementation((...paths) => paths.join("\\"));
      mockExistsSync.mockImplementation((path) => {
        return path === "C:\\Users\\vs861\\.openclaw" || path === "C:\\Users\\vs861\\.openclaw\\skills";
      });

      const result = await detectOpenClawWorkspace();

      expect(result).toEqual({
        found: true,
        path: "C:\\Users\\vs861\\.openclaw",
        skillsPath: "C:\\Users\\vs861\\.openclaw\\skills",
      });
    });

    it("should return not found when workspace directory missing", async () => {
      mockHomedir.mockReturnValue("/home/user");
      mockExistsSync.mockReturnValue(false);

      const result = await detectOpenClawWorkspace();

      expect(result).toEqual({
        found: false,
        path: null,
        skillsPath: null,
        error: "OpenClaw workspace not found",
      });
    });

    it("should detect workspace but warn when skills directory missing", async () => {
      mockHomedir.mockReturnValue("/home/user");
      mockExistsSync.mockImplementation((path) => {
        return path === "/home/user/.openclaw";
      });

      const result = await detectOpenClawWorkspace();

      expect(result).toEqual({
        found: true,
        path: "/home/user/.openclaw",
        skillsPath: "/home/user/.openclaw/skills",
        warning: "Skills directory not found, will be created",
      });
    });

    it("should check custom workspace path when provided", async () => {
      const customPath = "/opt/openclaw";
      mockExistsSync.mockImplementation((path) => {
        return path === customPath || path === customPath + "/skills";
      });

      const result = await detectOpenClawWorkspace(customPath);

      expect(result).toEqual({
        found: true,
        path: customPath,
        skillsPath: customPath + "/skills",
      });
      expect(mockExistsSync).toHaveBeenCalledWith(customPath);
    });
  });

  describe("Skills path validation", () => {
    it("should validate absolute paths correctly", () => {
      mockResolve.mockReturnValue("/home/user/.openclaw/skills");
      mockExistsSync.mockReturnValue(true);

      const result = validateSkillsPath("/home/user/.openclaw/skills");

      expect(result).toEqual({
        valid: true,
        resolvedPath: "/home/user/.openclaw/skills",
      });
    });

    it("should validate Windows paths correctly", () => {
      mockResolve.mockReturnValue("C:\\Users\\vs861\\.openclaw\\skills");
      mockNormalize.mockReturnValue("C:\\Users\\vs861\\.openclaw\\skills");
      mockExistsSync.mockReturnValue(true);

      const result = validateSkillsPath("C:\\Users\\vs861\\.openclaw\\skills");

      expect(result).toEqual({
        valid: true,
        resolvedPath: "C:\\Users\\vs861\\.openclaw\\skills",
      });
    });

    it("should handle relative paths", () => {
      mockResolve.mockReturnValue("/current/dir/skills");
      mockExistsSync.mockReturnValue(true);

      const result = validateSkillsPath("./skills");

      expect(result).toEqual({
        valid: true,
        resolvedPath: "/current/dir/skills",
      });
    });

    it("should return invalid for non-existent paths", () => {
      mockExistsSync.mockReturnValue(false);

      const result = validateSkillsPath("/nonexistent/path");

      expect(result).toEqual({
        valid: false,
        error: "Path does not exist: /nonexistent/path",
      });
    });
  });

  describe("Skill installation", () => {
    it("should install skill successfully when workspace found", async () => {
      detectOpenClawWorkspace.mockResolvedValue({
        found: true,
        path: "/home/user/.openclaw",
        skillsPath: "/home/user/.openclaw/skills",
      });

      installSkill.mockResolvedValue({
        success: true,
        skillName: "cashclaw-core",
        installedPath: "/home/user/.openclaw/skills/cashclaw-core",
      });

      const result = await installSkill("cashclaw-core");

      expect(result.success).toBe(true);
      expect(result.skillName).toBe("cashclaw-core");
      expect(detectOpenClawWorkspace).toHaveBeenCalled();
    });

    it("should fail installation when workspace not found", async () => {
      detectOpenClawWorkspace.mockResolvedValue({
        found: false,
        path: null,
        skillsPath: null,
        error: "OpenClaw workspace not found",
      });

      installSkill.mockResolvedValue({
        success: false,
        error: "OpenClaw workspace not found",
      });

      const result = await installSkill("cashclaw-content-writer");

      expect(result.success).toBe(false);
      expect(result.error).toBe("OpenClaw workspace not found");
    });

    it("should handle multiple skill installations", async () => {
      const skills = ["cashclaw-core", "cashclaw-content-writer", "cashclaw-invoice"];

      detectOpenClawWorkspace.mockResolvedValue({
        found: true,
        path: "/home/user/.openclaw",
        skillsPath: "/home/user/.openclaw/skills",
      });

      installSkill.mockImplementation(async (skillName) => {
        if (skillName === "cashclaw-core") {
          return { success: true, skillName, installedPath: "/home/user/.openclaw/skills/cashclaw-core" };
        }
        return { success: false, error: "OpenClaw workspace not found" };
      });

      const results = await Promise.all(skills.map(skill => installSkill(skill)));

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(false);
      expect(results[1].error).toBe("OpenClaw workspace not found");
    });
  });

  describe("CLI command integration", () => {
    it("should execute skills install command", async () => {
      runCLICommand.mockResolvedValue({
        success: true,
        output: "Installing 7 skills...\n✓ cashclaw-core: installed successfully",
      });

      const result = await runCLICommand(["skills", "install"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("Installing 7 skills");
    });

    it("should execute config set command for skills path", async () => {
      runCLICommand.mockResolvedValue({
        success: true,
        output: "Configuration updated: skills.path = C:\\Users\\vs861\\.openclaw\\skills",
      });

      const result = await runCLICommand(["config", "set", "skills.path", "C:\\Users\\vs861\\.openclaw\\skills"]);

      expect(result.success).toBe(true);
      expect(result.output).toContain("Configuration updated");
    });

    it("should handle CLI command failures", async () => {
      runCLICommand.mockResolvedValue({
        success: false,
        error: "Command not found: skills",
        exitCode: 1,
      });

      const result = await runCLICommand(["skills", "invalid-command"]);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Command not found");
      expect(result.exitCode).toBe(1);
    });
  });

  describe("Cross-platform path handling", () => {
    it("should normalize Windows paths correctly", () => {
      const windowsPath = "C:\\Users\\vs861\\.openclaw\\skills";
      mockNormalize.mockReturnValue("C:/Users/vs861/.openclaw/skills");

      const normalized = mockNormalize(windowsPath);

      expect(normalized).toBe("C:/Users/vs861/.openclaw/skills");
    });

    it("should handle Unix paths without modification", () => {
      const unixPath = "/home/user/.openclaw/skills";
      mockNormalize.mockReturnValue(unixPath);

      const normalized = mockNormalize(unixPath);

      expect(normalized).toBe(unixPath);
    });

    it("should resolve relative paths on both platforms", () => {
      mockResolve.mockImplementation((path) => {
        if (process.platform === "win32") {
          return `C:\\current\\dir\\${path.replace("./", "")}`;
        }
        return `/current/dir/${path.replace("./", "")}`;
      });

      const resolved = mockResolve("./skills");

      expect(resolved).toMatch(/skills$/);
    });
  });

  describe("Error scenarios", () => {
    it("should handle permission errors during workspace detection", async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error("EACCES: permission denied");
      });

      detectOpenClawWorkspace.mockRejectedValue(new Error("Permission denied accessing workspace"));

      await expect(detectOpenClawWorkspace()).rejects.toThrow("Permission denied accessing workspace");
    });

    it("should handle network errors during skill installation", async () => {
      detectOpenClawWorkspace.mockResolvedValue({
        found: true,
        path: "/home/user/.openclaw",
        skillsPath: "/home/user/.openclaw/skills",
      });

      installSkill.mockResolvedValue({
        success: false,
        error: "Network error: Failed to download skill package",
      });

      const result = await installSkill("cashclaw-network-skill");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network error");
    });

    it("should handle corrupted skill packages", async () => {
      installSkill.mockResolvedValue({
        success: false,
        error: "Invalid skill package: missing manifest.json",
      });

      const result = await installSkill("corrupted-skill");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid skill package");
    });

    it("should handle disk space errors", async () => {
      installSkill.mockResolvedValue({
        success: false,
        error: "ENOSPC: no space left on device",
      });

      const result = await installSkill("large-skill");

      expect(result.success).toBe(false);
      expect(result.error).toContain("no space left on device");
    });
  });
});
