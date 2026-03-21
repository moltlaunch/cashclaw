import { promises as fs } from "fs";
import { join, resolve, dirname } from "path";
import { homedir } from "os";
import { exec } from "child_process";
import { promisify } from "util";
import type { CashClawConfig } from "../config.js";

const execAsync = promisify(exec);

export interface SkillInstallResult {
  skillName: string;
  success: boolean;
  error?: string;
  path?: string;
}

export interface SkillPackage {
  name: string;
  version: string;
  description?: string;
  dependencies?: Record<string, string>;
  cashclaw?: {
    skillType: string;
    capabilities: string[];
  };
}

export class SkillInstaller {
  private config: CashClawConfig;
  private workspacePath?: string;

  constructor(config: CashClawConfig) {
    this.config = config;
  }

  async detectOpenClawWorkspace(): Promise<string | null> {
    const possiblePaths = [
      this.config.skills?.path,
      join(homedir(), ".openclaw", "skills"),
      join(homedir(), ".openclaw", "workspace"),
      join(process.cwd(), "openclaw"),
      join(process.cwd(), ".openclaw"),
    ].filter(Boolean);

    for (const path of possiblePaths) {
      if (await this.isValidWorkspace(path!)) {
        return path!;
      }
    }

    // Try to find via npm global path
    try {
      const { stdout } = await execAsync("npm root -g");
      const globalPath = stdout.trim();
      const openclawPath = join(globalPath, "openclaw");

      if (await this.pathExists(openclawPath)) {
        const skillsPath = join(openclawPath, "skills");
        if (await this.pathExists(skillsPath)) {
          return skillsPath;
        }
      }
    } catch {
      // Ignore npm errors
    }

    return null;
  }

  private async isValidWorkspace(path: string): Promise<boolean> {
    try {
      const stat = await fs.stat(path);
      if (!stat.isDirectory()) return false;

      // Check for workspace indicators
      const indicators = [
        "package.json",
        "skills",
        ".openclaw",
        "node_modules"
      ];

      for (const indicator of indicators) {
        const indicatorPath = join(path, indicator);
        if (await this.pathExists(indicatorPath)) {
          return true;
        }
      }

      return false;
    } catch {
      return false;
    }
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  async initializeWorkspace(): Promise<void> {
    const workspace = await this.detectOpenClawWorkspace();

    if (!workspace) {
      const defaultPath = join(homedir(), ".openclaw", "skills");
      await fs.mkdir(defaultPath, { recursive: true });

      const packageJson = {
        name: "cashclaw-skills-workspace",
        version: "1.0.0",
        description: "CashClaw skills workspace",
        private: true,
        dependencies: {}
      };

      await fs.writeFile(
        join(defaultPath, "package.json"),
        JSON.stringify(packageJson, null, 2)
      );

      this.workspacePath = defaultPath;
    } else {
      this.workspacePath = workspace;
    }
  }

  async installSkill(skillName: string): Promise<SkillInstallResult> {
    if (!this.workspacePath) {
      await this.initializeWorkspace();
    }

    if (!this.workspacePath) {
      return {
        skillName,
        success: false,
        error: "OpenClaw workspace not found and could not be created"
      };
    }

    try {
      // Check if skill already exists
      const skillPath = join(this.workspacePath, "node_modules", skillName);
      if (await this.pathExists(skillPath)) {
        return {
          skillName,
          success: true,
          path: skillPath,
          error: "Skill already installed"
        };
      }

      // Install via npm
      const { stdout, stderr } = await execAsync(
        `npm install ${skillName}`,
        { cwd: this.workspacePath }
      );

      if (stderr && stderr.includes("ERR!")) {
        throw new Error(stderr);
      }

      // Validate installation
      const installedPath = join(this.workspacePath, "node_modules", skillName);
      const isValid = await this.validateSkillInstallation(installedPath);

      if (!isValid) {
        throw new Error("Skill validation failed after installation");
      }

      return {
        skillName,
        success: true,
        path: installedPath
      };

    } catch (error) {
      return {
        skillName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown installation error"
      };
    }
  }

  async installSkills(skillNames: string[]): Promise<SkillInstallResult[]> {
    const results: SkillInstallResult[] = [];

    for (const skillName of skillNames) {
      const result = await this.installSkill(skillName);
      results.push(result);
    }

    return results;
  }

  private async validateSkillInstallation(skillPath: string): Promise<boolean> {
    try {
      const packageJsonPath = join(skillPath, "package.json");
      if (!(await this.pathExists(packageJsonPath))) {
        return false;
      }

      const packageData = await fs.readFile(packageJsonPath, "utf-8");
      const pkg: SkillPackage = JSON.parse(packageData);

      // Basic validation
      if (!pkg.name || !pkg.version) {
        return false;
      }

      // Check for CashClaw-specific metadata
      if (pkg.cashclaw) {
        const requiredFields = ["skillType", "capabilities"];
        for (const field of requiredFields) {
          if (!pkg.cashclaw[field as keyof typeof pkg.cashclaw]) {
            return false;
          }
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  async listInstalledSkills(): Promise<SkillPackage[]> {
    if (!this.workspacePath) {
      await this.initializeWorkspace();
    }

    if (!this.workspacePath) {
      return [];
    }

    const skills: SkillPackage[] = [];
    const nodeModulesPath = join(this.workspacePath, "node_modules");

    if (!(await this.pathExists(nodeModulesPath))) {
      return skills;
    }

    try {
      const entries = await fs.readdir(nodeModulesPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith("cashclaw-")) {
          const skillPath = join(nodeModulesPath, entry.name);
          const packageJsonPath = join(skillPath, "package.json");

          if (await this.pathExists(packageJsonPath)) {
            try {
              const packageData = await fs.readFile(packageJsonPath, "utf-8");
              const pkg: SkillPackage = JSON.parse(packageData);
              skills.push(pkg);
            } catch {
              // Skip invalid packages
            }
          }
        }
      }
    } catch {
      // Return empty array on error
    }

    return skills;
  }

  async uninstallSkill(skillName: string): Promise<SkillInstallResult> {
    if (!this.workspacePath) {
      return {
        skillName,
        success: false,
        error: "OpenClaw workspace not found"
      };
    }

    try {
      const { stderr } = await execAsync(
        `npm uninstall ${skillName}`,
        { cwd: this.workspacePath }
      );

      if (stderr && stderr.includes("ERR!")) {
        throw new Error(stderr);
      }

      return {
        skillName,
        success: true
      };

    } catch (error) {
      return {
        skillName,
        success: false,
        error: error instanceof Error ? error.message : "Unknown uninstall error"
      };
    }
  }

  getWorkspacePath(): string | undefined {
    return this.workspacePath;
  }

  async repairWorkspace(): Promise<boolean> {
    try {
      const workspace = await this.detectOpenClawWorkspace();

      if (!workspace) {
        await this.initializeWorkspace();
        return true;
      }

      // Verify package.json exists
      const packageJsonPath = join(workspace, "package.json");
      if (!(await this.pathExists(packageJsonPath))) {
        const packageJson = {
          name: "cashclaw-skills-workspace",
          version: "1.0.0",
          private: true,
          dependencies: {}
        };

        await fs.writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));
      }

      this.workspacePath = workspace;
      return true;
    } catch {
      return false;
    }
  }
}
