import { promises as fs } from 'fs';
import { join, resolve, dirname, sep } from 'path';
import { homedir } from 'os';

export interface WorkspaceInfo {
  path: string;
  exists: boolean;
  isValid: boolean;
  skillsPath: string;
  configPath: string;
}

export interface WorkspaceValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const OPENCLAW_CONFIG_DIR = '.openclaw';
const SKILLS_SUBDIR = 'skills';
const CONFIG_FILE = 'config.json';

export class WorkspaceManager {
  private static instance: WorkspaceManager;
  private cachedWorkspace: WorkspaceInfo | null = null;

  static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager();
    }
    return WorkspaceManager.instance;
  }

  async detectWorkspace(): Promise<WorkspaceInfo> {
    if (this.cachedWorkspace) {
      return this.cachedWorkspace;
    }

    const possiblePaths = await this.getPossibleWorkspacePaths();

    for (const path of possiblePaths) {
      const workspace = await this.validateWorkspacePath(path);
      if (workspace.exists) {
        this.cachedWorkspace = workspace;
        return workspace;
      }
    }

    const defaultPath = this.getDefaultWorkspacePath();
    const workspace = await this.validateWorkspacePath(defaultPath);
    this.cachedWorkspace = workspace;
    return workspace;
  }

  private async getPossibleWorkspacePaths(): Promise<string[]> {
    const paths: string[] = [];

    const homeDir = homedir();
    paths.push(join(homeDir, OPENCLAW_CONFIG_DIR));

    if (process.env.OPENCLAW_HOME) {
      paths.unshift(resolve(process.env.OPENCLAW_HOME));
    }

    if (process.env.APPDATA && process.platform === 'win32') {
      paths.push(join(process.env.APPDATA, 'openclaw'));
    }

    if (process.env.XDG_CONFIG_HOME) {
      paths.push(join(process.env.XDG_CONFIG_HOME, 'openclaw'));
    }

    return paths;
  }

  private getDefaultWorkspacePath(): string {
    const homeDir = homedir();
    return join(homeDir, OPENCLAW_CONFIG_DIR);
  }

  private async validateWorkspacePath(workspacePath: string): Promise<WorkspaceInfo> {
    const skillsPath = join(workspacePath, SKILLS_SUBDIR);
    const configPath = join(workspacePath, CONFIG_FILE);

    let exists = false;
    let isValid = false;

    try {
      const stats = await fs.stat(workspacePath);
      exists = stats.isDirectory();

      if (exists) {
        const skillsExists = await this.pathExists(skillsPath);
        const configExists = await this.pathExists(configPath);
        isValid = skillsExists || configExists;
      }
    } catch {
      exists = false;
    }

    return {
      path: workspacePath,
      exists,
      isValid,
      skillsPath,
      configPath,
    };
  }

  async initializeWorkspace(workspacePath?: string): Promise<WorkspaceInfo> {
    const targetPath = workspacePath || this.getDefaultWorkspacePath();

    await this.ensureDirectoryExists(targetPath);

    const skillsPath = join(targetPath, SKILLS_SUBDIR);
    await this.ensureDirectoryExists(skillsPath);

    const configPath = join(targetPath, CONFIG_FILE);
    await this.ensureConfigFile(configPath);

    this.cachedWorkspace = null;
    return await this.detectWorkspace();
  }

  async validateWorkspace(workspacePath: string): Promise<WorkspaceValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const stats = await fs.stat(workspacePath);
      if (!stats.isDirectory()) {
        errors.push('Workspace path is not a directory');
      }
    } catch {
      errors.push('Workspace directory does not exist');
      return { isValid: false, errors, warnings };
    }

    const skillsPath = join(workspacePath, SKILLS_SUBDIR);
    if (!await this.pathExists(skillsPath)) {
      warnings.push('Skills directory does not exist');
    } else {
      try {
        const skillsStats = await fs.stat(skillsPath);
        if (!skillsStats.isDirectory()) {
          errors.push('Skills path exists but is not a directory');
        }
      } catch {
        errors.push('Cannot access skills directory');
      }
    }

    const configPath = join(workspacePath, CONFIG_FILE);
    if (!await this.pathExists(configPath)) {
      warnings.push('Config file does not exist');
    } else {
      try {
        const configContent = await fs.readFile(configPath, 'utf-8');
        JSON.parse(configContent);
      } catch {
        errors.push('Config file is not valid JSON');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error: any) {
      if (error.code !== 'EEXIST') {
        throw new Error(`Failed to create directory ${dirPath}: ${error.message}`);
      }
    }
  }

  private async ensureConfigFile(configPath: string): Promise<void> {
    if (await this.pathExists(configPath)) {
      return;
    }

    const defaultConfig = {
      version: "1.0.0",
      skills: {},
      created: new Date().toISOString(),
    };

    try {
      await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    } catch (error: any) {
      throw new Error(`Failed to create config file: ${error.message}`);
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

  async getSkillsDirectory(): Promise<string> {
    const workspace = await this.detectWorkspace();
    if (!workspace.exists) {
      await this.initializeWorkspace(workspace.path);
    }
    return workspace.skillsPath;
  }

  clearCache(): void {
    this.cachedWorkspace = null;
  }

  static normalizePath(path: string): string {
    return path.split(/[/\\]/).join(sep);
  }

  static isAbsolute(path: string): boolean {
    if (process.platform === 'win32') {
      return /^[A-Za-z]:\\/.test(path) || path.startsWith('\\\\');
    }
    return path.startsWith('/');
  }
}

export async function detectOpenClawWorkspace(): Promise<WorkspaceInfo> {
  const manager = WorkspaceManager.getInstance();
  return await manager.detectWorkspace();
}

export async function initializeOpenClawWorkspace(path?: string): Promise<WorkspaceInfo> {
  const manager = WorkspaceManager.getInstance();
  return await manager.initializeWorkspace(path);
}

export async function validateOpenClawWorkspace(path: string): Promise<WorkspaceValidation> {
  const manager = WorkspaceManager.getInstance();
  return await manager.validateWorkspace(path);
}

export async function getSkillsDirectory(): Promise<string> {
  const manager = WorkspaceManager.getInstance();
  return await manager.getSkillsDirectory();
}
