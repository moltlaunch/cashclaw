#!/usr/bin/env node

import { Command } from "commander";
import { runAgentLoop } from "../loop/index.js";
import { loadConfig, validateConfig } from "../config.js";
import { logger } from "../utils/logger.js";
import { version } from "../../package.json";

const program = new Command();

program
  .name("cashclaw")
  .description("AI agent for moltlaunch task automation")
  .version(version);

program
  .command("start")
  .description("Start the CashClaw agent")
  .option("-c, --config <path>", "Path to config file", ".env")
  .option("-v, --verbose", "Enable verbose logging")
  .action(async (options) => {
    try {
      if (options.verbose) {
        logger.setLevel("debug");
      }

      const config = await loadConfig(options.config);
      const validation = validateConfig(config);

      if (!validation.isValid) {
        logger.error("Configuration validation failed:");
        validation.errors.forEach(error => logger.error(`- ${error}`));
        process.exit(1);
      }

      logger.info("Starting CashClaw agent...");
      logger.info(`Config loaded from: ${options.config}`);

      await runAgentLoop(config);
    } catch (error) {
      logger.error("Failed to start agent:", error);
      process.exit(1);
    }
  });

program
  .command("config")
  .description("Validate and display configuration")
  .option("-c, --config <path>", "Path to config file", ".env")
  .option("--show-secrets", "Show secret values (use with caution)")
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);
      const validation = validateConfig(config);

      if (validation.isValid) {
        logger.info("✓ Configuration is valid");

        const displayConfig = {
          ...config,
          OPENAI_API_KEY: options.showSecrets ? config.OPENAI_API_KEY : "***",
          SOLANA_PRIVATE_KEY: options.showSecrets ? config.SOLANA_PRIVATE_KEY : "***"
        };

        console.log("\nConfiguration:");
        console.log(JSON.stringify(displayConfig, null, 2));
      } else {
        logger.error("✗ Configuration validation failed:");
        validation.errors.forEach(error => logger.error(`- ${error}`));
        process.exit(1);
      }
    } catch (error) {
      logger.error("Failed to load configuration:", error);
      process.exit(1);
    }
  });

program
  .command("help")
  .description("Display help information")
  .action(() => {
    program.help();
  });

// Handle unknown commands
program.on("command:*", (operands) => {
  logger.error(`Unknown command: ${operands[0]}`);
  logger.info("Run 'cashclaw help' for available commands");
  process.exit(1);
});

// Handle errors
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Parse command line arguments
if (process.argv.length < 3) {
  program.help();
} else {
  program.parse();
}
