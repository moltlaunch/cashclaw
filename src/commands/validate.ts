import { Command } from "commander";
import chalk from "chalk";
import { validateAgentRegistration } from "../moltlaunch/register.js";
import type { CashClawConfig } from "../config.js";

interface ValidationResult {
  isValid: boolean;
  issues: string[];
  warnings: string[];
  suggestions: string[];
}

export function createValidateCommand(): Command {
  return new Command("validate")
    .description("Validate agent configuration and registration status")
    .option("-w, --wallet <address>", "Solana wallet address to validate")
    .option("-v, --verbose", "Show detailed validation output")
    .action(async (options) => {
      try {
        const config = await loadConfig();
        const walletAddress = options.wallet || config.solana?.wallet;

        if (!walletAddress) {
          console.error(chalk.red("❌ No wallet address provided. Use --wallet option or set SOLANA_WALLET in config"));
          process.exit(1);
        }

        console.log(chalk.blue("🔍 Validating agent configuration..."));
        console.log(chalk.gray(`Wallet: ${walletAddress}`));

        const result = await validateAgentSetup(config, walletAddress, options.verbose);

        displayValidationResults(result);

        if (!result.isValid) {
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red("❌ Validation failed:"), error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}

async function validateAgentSetup(config: CashClawConfig, walletAddress: string, verbose: boolean): Promise<ValidationResult> {
  const result: ValidationResult = {
    isValid: true,
    issues: [],
    warnings: [],
    suggestions: []
  };

  // Check basic configuration
  await validateBasicConfig(config, result);

  // Check agent registration
  await validateRegistration(walletAddress, result, verbose);

  // Check API connectivity
  await validateAPIConnectivity(config, result);

  result.isValid = result.issues.length === 0;
  return result;
}

async function validateBasicConfig(config: CashClawConfig, result: ValidationResult): Promise<void> {
  if (!config.moltlaunch?.baseUrl) {
    result.issues.push("MoltLaunch base URL not configured");
    result.suggestions.push("Set MOLTLAUNCH_BASE_URL in your environment variables");
  }

  if (!config.solana?.wallet) {
    result.issues.push("Solana wallet address not configured");
    result.suggestions.push("Set SOLANA_WALLET in your environment variables");
  }

  if (!config.llm?.provider) {
    result.warnings.push("LLM provider not configured - agent responses may be limited");
    result.suggestions.push("Configure OpenAI or Anthropic API keys for full functionality");
  }

  if (!config.agent?.name) {
    result.issues.push("Agent name not configured");
    result.suggestions.push("Set AGENT_NAME in your configuration");
  }

  if (!config.agent?.description) {
    result.warnings.push("Agent description not set - this helps users understand your agent's capabilities");
  }
}

async function validateRegistration(walletAddress: string, result: ValidationResult, verbose: boolean): Promise<void> {
  try {
    const registrationResult = await validateAgentRegistration(walletAddress);

    if (!registrationResult.isRegistered) {
      result.issues.push("Agent is not registered on MoltLaunch");
      result.suggestions.push("Run 'npx cashclaw register' to register your agent");
      return;
    }

    if (verbose) {
      console.log(chalk.green("✅ Agent found in registry"));
      console.log(chalk.gray(`Agent ID: ${registrationResult.agentId}`));
      console.log(chalk.gray(`Name: ${registrationResult.name}`));
    }

    // Check for common registration issues
    if (registrationResult.owner === "0x0000000000000000000000000000000000000000") {
      result.issues.push("Agent owner is null address - registration may be incomplete");
      result.suggestions.push("Try re-registering your agent with proper ownership");
    }

    if (registrationResult.agentWallet === "0x1111111111111111111111111111111111111111") {
      result.warnings.push("Agent wallet appears to be a placeholder address");
      result.suggestions.push("Verify your Solana wallet address is correctly configured");
    }

    // Validate agent URI and metadata
    if (registrationResult.agentURI?.startsWith("data:application/json;base64,")) {
      try {
        const metadata = JSON.parse(atob(registrationResult.agentURI.split(",")[1]));
        if (!metadata.name || !metadata.description) {
          result.warnings.push("Agent metadata is incomplete");
        }
      } catch {
        result.issues.push("Agent metadata is malformed");
      }
    }

    // Check skills configuration
    if (!registrationResult.skills || registrationResult.skills.length === 0) {
      result.warnings.push("No skills defined - users won't know what tasks your agent can handle");
      result.suggestions.push("Add skills to your agent configuration to improve discoverability");
    }

  } catch (error) {
    result.issues.push(`Failed to check registration status: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function validateAPIConnectivity(config: CashClawConfig, result: ValidationResult): Promise<void> {
  try {
    const baseUrl = config.moltlaunch?.baseUrl || "https://api.moltlaunch.com";
    const response = await fetch(`${baseUrl}/health`);

    if (!response.ok) {
      result.warnings.push(`MoltLaunch API returned status ${response.status}`);
    }
  } catch (error) {
    result.warnings.push("Could not connect to MoltLaunch API - check your internet connection");
  }
}

function displayValidationResults(result: ValidationResult): void {
  console.log("\n" + chalk.bold("🔍 Validation Results"));
  console.log("=" + "=".repeat(50));

  if (result.isValid) {
    console.log(chalk.green("✅ Agent configuration is valid!"));
  } else {
    console.log(chalk.red("❌ Agent configuration has issues"));
  }

  if (result.issues.length > 0) {
    console.log("\n" + chalk.red.bold("Issues that need to be fixed:"));
    result.issues.forEach(issue => {
      console.log(chalk.red(`  ❌ ${issue}`));
    });
  }

  if (result.warnings.length > 0) {
    console.log("\n" + chalk.yellow.bold("Warnings:"));
    result.warnings.forEach(warning => {
      console.log(chalk.yellow(`  ⚠️  ${warning}`));
    });
  }

  if (result.suggestions.length > 0) {
    console.log("\n" + chalk.blue.bold("Suggestions:"));
    result.suggestions.forEach(suggestion => {
      console.log(chalk.blue(`  💡 ${suggestion}`));
    });
  }

  console.log();
}

async function loadConfig(): Promise<CashClawConfig> {
  return {
    moltlaunch: {
      baseUrl: process.env.MOLTLAUNCH_BASE_URL || "https://api.moltlaunch.com"
    },
    solana: {
      wallet: process.env.SOLANA_WALLET
    },
    llm: {
      provider: process.env.LLM_PROVIDER as any
    },
    agent: {
      name: process.env.AGENT_NAME,
      description: process.env.AGENT_DESCRIPTION,
      skills: process.env.AGENT_SKILLS?.split(",") || []
    }
  };
}
