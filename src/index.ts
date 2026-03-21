#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { runAgentLoop } from "./loop/index.js";
import { loadConfig } from "./config.js";
import type { CashClawConfig } from "./config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8")
);

const program = new Command();

program
  .name("mltl")
  .description("MoltLaunch CashClaw - Autonomous agent for decentralized task marketplace")
  .version(packageJson.version);

program
  .command("start")
  .description("Start the CashClaw agent")
  .option("-c, --config <path>", "Config file path", "./config.json")
  .option("--dry-run", "Run in dry-run mode without executing actions")
  .option("--verbose", "Enable verbose logging")
  .action(async (options) => {
    try {
      console.log(chalk.blue("🚀 Starting CashClaw agent..."));

      const config = await loadConfig(options.config);

      if (options.verbose) {
        console.log(chalk.gray("Configuration loaded:"));
        console.log(chalk.gray(JSON.stringify(config, null, 2)));
      }

      if (options.dryRun) {
        console.log(chalk.yellow("⚠️  Running in dry-run mode"));
        config.dryRun = true;
      }

      await runAgentLoop(config);
    } catch (error) {
      console.error(chalk.red("❌ Failed to start agent:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Generate default configuration file")
  .option("-o, --output <path>", "Output file path", "./config.json")
  .action((options) => {
    try {
      const defaultConfig: CashClawConfig = {
        llm: {
          provider: "openai",
          apiKey: process.env.OPENAI_API_KEY || "",
          model: "gpt-4"
        },
        solana: {
          rpcUrl: process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
          privateKey: process.env.SOLANA_PRIVATE_KEY || ""
        },
        moltlaunch: {
          apiUrl: process.env.MOLTLAUNCH_API_URL || "https://api.moltlaunch.com",
          walletAddress: process.env.MOLTLAUNCH_WALLET || ""
        },
        agent: {
          pollingInterval: 30000,
          maxConcurrentTasks: 3,
          skills: ["writing", "coding", "research"]
        },
        dryRun: false
      };

      import("fs").then(({ writeFileSync }) => {
        writeFileSync(options.output, JSON.stringify(defaultConfig, null, 2));
        console.log(chalk.green(`✅ Configuration file created: ${options.output}`));
        console.log(chalk.yellow("⚠️  Don't forget to set your API keys and wallet addresses!"));
      });
    } catch (error) {
      console.error(chalk.red("❌ Failed to create config:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Check system status and configuration")
  .option("-c, --config <path>", "Config file path", "./config.json")
  .action(async (options) => {
    try {
      console.log(chalk.blue("📊 CashClaw System Status"));
      console.log("─".repeat(40));

      const config = await loadConfig(options.config);

      console.log(chalk.green("✅ Configuration loaded"));
      console.log(chalk.gray(`   LLM Provider: ${config.llm.provider}`));
      console.log(chalk.gray(`   Solana RPC: ${config.solana.rpcUrl}`));
      console.log(chalk.gray(`   Skills: ${config.agent.skills.join(", ")}`));

      if (config.llm.apiKey) {
        console.log(chalk.green("✅ LLM API key configured"));
      } else {
        console.log(chalk.red("❌ LLM API key missing"));
      }

      if (config.solana.privateKey) {
        console.log(chalk.green("✅ Solana wallet configured"));
      } else {
        console.log(chalk.red("❌ Solana wallet not configured"));
      }

      if (config.moltlaunch.walletAddress) {
        console.log(chalk.green("✅ MoltLaunch wallet configured"));
      } else {
        console.log(chalk.red("❌ MoltLaunch wallet not configured"));
      }

    } catch (error) {
      console.error(chalk.red("❌ Status check failed:"));
      console.error(chalk.red(error instanceof Error ? error.message : String(error)));
      process.exit(1);
    }
  });

// Handle cashclaw alias command
if (process.argv[2] === "cashclaw") {
  process.argv[2] = "start";
}

program.parse();
