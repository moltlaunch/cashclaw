import { runAgentLoop } from "../loop/index.js";
import { loadConfig, saveConfig, type CashClawConfig } from "../config.js";
import { PublicKey } from "@solana/web3.js";
import fs from "fs/promises";
import path from "path";

export interface CommandResult {
  success: boolean;
  message?: string;
  error?: string;
}

export async function startCommand(args: string[]): Promise<CommandResult> {
  try {
    console.log("🚀 Starting CashClaw agent...");

    const config = await loadConfig();
    if (!config.walletPrivateKey) {
      return {
        success: false,
        error: "Wallet private key not configured. Run 'cashclaw config --wallet <private_key>' first."
      };
    }

    if (!config.openaiApiKey && !config.anthropicApiKey) {
      return {
        success: false,
        error: "LLM API key not configured. Run 'cashclaw config --openai-key <key>' or 'cashclaw config --anthropic-key <key>' first."
      };
    }

    const intervalMs = args.includes("--interval")
      ? parseInt(args[args.indexOf("--interval") + 1] || "30000")
      : config.pollingIntervalMs;

    console.log(`📊 Polling interval: ${intervalMs}ms`);
    console.log(`🔗 RPC URL: ${config.rpcUrl}`);
    console.log(`💼 Wallet: ${new PublicKey(JSON.parse(config.walletPrivateKey)).toString()}`);

    await runAgentLoop(config, intervalMs);

    return {
      success: true,
      message: "Agent loop completed successfully"
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to start agent: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export async function configCommand(args: string[]): Promise<CommandResult> {
  try {
    const config = await loadConfig();

    if (args.length === 0) {
      return await showConfig(config);
    }

    let updated = false;

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const value = args[i + 1];

      switch (arg) {
        case "--wallet":
        case "-w":
          if (!value) {
            return { success: false, error: "Wallet private key value required" };
          }
          try {
            JSON.parse(value);
            config.walletPrivateKey = value;
            updated = true;
            console.log("✅ Wallet private key updated");
          } catch {
            return { success: false, error: "Invalid wallet private key format (should be JSON array)" };
          }
          i++;
          break;

        case "--openai-key":
          if (!value) {
            return { success: false, error: "OpenAI API key value required" };
          }
          config.openaiApiKey = value;
          updated = true;
          console.log("✅ OpenAI API key updated");
          i++;
          break;

        case "--anthropic-key":
          if (!value) {
            return { success: false, error: "Anthropic API key value required" };
          }
          config.anthropicApiKey = value;
          updated = true;
          console.log("✅ Anthropic API key updated");
          i++;
          break;

        case "--rpc":
          if (!value) {
            return { success: false, error: "RPC URL value required" };
          }
          config.rpcUrl = value;
          updated = true;
          console.log("✅ RPC URL updated");
          i++;
          break;

        case "--interval":
          if (!value) {
            return { success: false, error: "Polling interval value required" };
          }
          const interval = parseInt(value);
          if (isNaN(interval) || interval < 1000) {
            return { success: false, error: "Polling interval must be at least 1000ms" };
          }
          config.pollingIntervalMs = interval;
          updated = true;
          console.log("✅ Polling interval updated");
          i++;
          break;

        case "--moltlaunch-url":
          if (!value) {
            return { success: false, error: "Moltlaunch URL value required" };
          }
          config.moltlaunchUrl = value;
          updated = true;
          console.log("✅ Moltlaunch URL updated");
          i++;
          break;

        default:
          return { success: false, error: `Unknown config option: ${arg}` };
      }
    }

    if (updated) {
      await saveConfig(config);
      return { success: true, message: "Configuration updated successfully" };
    }

    return { success: true, message: "No changes made" };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update config: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

async function showConfig(config: CashClawConfig): Promise<CommandResult> {
  console.log("\n📋 Current Configuration:");
  console.log("========================");

  console.log(`🔗 RPC URL: ${config.rpcUrl}`);
  console.log(`🌐 Moltlaunch URL: ${config.moltlaunchUrl}`);
  console.log(`⏱️  Polling Interval: ${config.pollingIntervalMs}ms`);

  if (config.walletPrivateKey) {
    try {
      const publicKey = new PublicKey(JSON.parse(config.walletPrivateKey)).toString();
      console.log(`💼 Wallet: ${publicKey}`);
    } catch {
      console.log("💼 Wallet: ❌ Invalid private key format");
    }
  } else {
    console.log("💼 Wallet: ❌ Not configured");
  }

  console.log(`🤖 OpenAI API Key: ${config.openaiApiKey ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`🤖 Anthropic API Key: ${config.anthropicApiKey ? '✅ Configured' : '❌ Not configured'}`);

  console.log("\n💡 To update configuration:");
  console.log("cashclaw config --wallet <private_key_json>");
  console.log("cashclaw config --openai-key <api_key>");
  console.log("cashclaw config --anthropic-key <api_key>");
  console.log("cashclaw config --rpc <rpc_url>");
  console.log("cashclaw config --interval <milliseconds>");
  console.log("cashclaw config --moltlaunch-url <url>");

  return { success: true };
}

export async function helpCommand(): Promise<CommandResult> {
  const helpText = `
🦀 CashClaw - Autonomous Bounty Hunter Agent

USAGE:
  cashclaw <command> [options]

COMMANDS:
  start                 Start the agent loop to hunt for bounties
  config [options]      Configure the agent settings
  help                  Show this help message

START OPTIONS:
  --interval <ms>       Polling interval in milliseconds (default: 30000)

CONFIG OPTIONS:
  --wallet <key>        Set wallet private key (JSON array format)
  --openai-key <key>    Set OpenAI API key
  --anthropic-key <key> Set Anthropic API key
  --rpc <url>           Set Solana RPC URL
  --interval <ms>       Set default polling interval
  --moltlaunch-url <url> Set Moltlaunch API base URL

EXAMPLES:
  cashclaw start                              # Start with default settings
  cashclaw start --interval 60000            # Start with 1-minute polling
  cashclaw config                             # Show current configuration
  cashclaw config --wallet "[1,2,3,...]"     # Set wallet private key
  cashclaw config --openai-key sk-...        # Set OpenAI API key
  cashclaw config --rpc https://api.mainnet-beta.solana.com

NOTES:
  • Wallet private key should be a JSON array of 64 bytes
  • Either OpenAI or Anthropic API key is required
  • Configuration is stored in ~/.cashclaw/config.json

For more information, visit: https://github.com/moltlaunch/cashclaw
`;

  console.log(helpText);
  return { success: true };
}
