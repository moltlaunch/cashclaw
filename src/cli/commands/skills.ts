import { Command } from "commander";
import { promises as fs } from "fs";
import path from "path";
import chalk from "chalk";
import { WorkspaceManager } from "../workspace/manager.js";
import { SkillInstaller } from "../skills/installer.js";
import type { SkillDefinition } from "../skills/types.js";

interface SkillsCommandOptions {
  workspace?: string;
  force?: boolean;
  verbose?: boolean;
}

export function createSkillsCommand(): Command {
  const command = new Command("skills");
  command.description("Manage CashClaw skills");

  command
    .command("list")
    .description("List available and installed skills")
    .option("-w, --workspace <path>", "OpenClaw workspace path")
    .option("-v, --verbose", "Show detailed information")
    .action(async (options: SkillsCommandOptions) => {
      try {
        await handleListSkills(options);
      } catch (error) {
        console.error(chalk.red("Error listing skills:"), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  command
    .command("install [skills...]")
    .description("Install skills to OpenClaw workspace")
    .option("-w, --workspace <path>", "OpenClaw workspace path")
    .option("-f, --force", "Force reinstall existing skills")
    .option("-v, --verbose", "Show detailed installation progress")
    .action(async (skillNames: string[], options: SkillsCommandOptions) => {
      try {
        await handleInstallSkills(skillNames, options);
      } catch (error) {
        console.error(chalk.red("Error installing skills:"), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  command
    .command("init-workspace [path]")
    .description("Initialize OpenClaw workspace")
    .option("-f, --force", "Force recreate existing workspace")
    .action(async (workspacePath: string | undefined, options: SkillsCommandOptions) => {
      try {
        await handleInitWorkspace(workspacePath, options);
      } catch (error) {
        console.error(chalk.red("Error initializing workspace:"), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return command;
}

async function handleListSkills(options: SkillsCommandOptions): Promise<void> {
  console.log(chalk.blue("📋 Available CashClaw Skills\n"));

  const workspaceManager = new WorkspaceManager();
  let workspacePath: string | null = null;

  try {
    workspacePath = await workspaceManager.findWorkspace(options.workspace);
  } catch (error) {
    if (options.verbose) {
      console.warn(chalk.yellow("Warning: OpenClaw workspace not found"));
      console.warn(chalk.dim("Run 'cashclaw skills init-workspace' to create one\n"));
    }
  }

  const installer = new SkillInstaller(workspacePath);
  const availableSkills = await installer.getAvailableSkills();

  let installedSkills: Set<string> = new Set();
  if (workspacePath) {
    try {
      installedSkills = await installer.getInstalledSkills();
    } catch (error) {
      if (options.verbose) {
        console.warn(chalk.yellow("Warning: Could not check installed skills"));
      }
    }
  }

  for (const skill of availableSkills) {
    const isInstalled = installedSkills.has(skill.name);
    const status = isInstalled ? chalk.green("✓ installed") : chalk.dim("○ available");

    console.log(`${status} ${chalk.bold(skill.name)}`);
    if (options.verbose) {
      console.log(`  ${chalk.dim(skill.description)}`);
      if (skill.version) {
        console.log(`  ${chalk.dim(`Version: ${skill.version}`)}`);
      }
    }
    console.log();
  }

  if (workspacePath) {
    console.log(chalk.dim(`Workspace: ${workspacePath}`));
  } else {
    console.log(chalk.yellow("No workspace found. Run 'cashclaw skills init-workspace' to create one."));
  }
}

async function handleInstallSkills(skillNames: string[], options: SkillsCommandOptions): Promise<void> {
  const workspaceManager = new WorkspaceManager();

  let workspacePath: string | null;
  try {
    workspacePath = await workspaceManager.findWorkspace(options.workspace);
  } catch (error) {
    throw new Error("OpenClaw workspace not found. Run 'cashclaw skills init-workspace' to create one.");
  }

  const installer = new SkillInstaller(workspacePath);
  const availableSkills = await installer.getAvailableSkills();

  let skillsToInstall: SkillDefinition[];

  if (skillNames.length === 0) {
    skillsToInstall = availableSkills;
    console.log(chalk.blue(`Installing all ${skillsToInstall.length} skills...`));
  } else {
    skillsToInstall = [];
    for (const skillName of skillNames) {
      const skill = availableSkills.find(s => s.name === skillName);
      if (!skill) {
        throw new Error(`Skill '${skillName}' not found`);
      }
      skillsToInstall.push(skill);
    }
    console.log(chalk.blue(`Installing ${skillsToInstall.length} skill(s)...`));
  }

  const results = await installer.installSkills(skillsToInstall, {
    force: options.force,
    onProgress: (skill: string, status: string) => {
      if (options.verbose) {
        console.log(chalk.dim(`${skill}: ${status}`));
      }
    }
  });

  console.log();
  let successCount = 0;
  let failureCount = 0;

  for (const result of results) {
    if (result.success) {
      console.log(chalk.green(`✓ ${result.skill}`));
      successCount++;
    } else {
      console.log(chalk.red(`✗ ${result.skill}: ${result.error}`));
      failureCount++;
    }
  }

  console.log();
  if (successCount > 0) {
    console.log(chalk.green(`Successfully installed ${successCount} skill(s)`));
  }
  if (failureCount > 0) {
    console.log(chalk.red(`Failed to install ${failureCount} skill(s)`));
  }
}

async function handleInitWorkspace(workspacePath: string | undefined, options: SkillsCommandOptions): Promise<void> {
  const workspaceManager = new WorkspaceManager();

  let targetPath: string;
  if (workspacePath) {
    targetPath = path.resolve(workspacePath);
  } else {
    const defaultPath = await workspaceManager.getDefaultWorkspacePath();
    targetPath = defaultPath;
  }

  console.log(chalk.blue(`Initializing OpenClaw workspace at: ${targetPath}`));

  try {
    const exists = await fs.stat(targetPath).then(() => true).catch(() => false);
    if (exists && !options.force) {
      throw new Error("Workspace already exists. Use --force to recreate.");
    }

    await workspaceManager.initializeWorkspace(targetPath, options.force);

    console.log(chalk.green("✓ Workspace initialized successfully"));
    console.log(chalk.dim(`You can now install skills with: cashclaw skills install`));
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      throw error;
    }
    throw new Error(`Failed to initialize workspace: ${error instanceof Error ? error.message : String(error)}`);
  }
}
