import { Command } from "commander";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { readAgentRegistry } from "../contracts/AgentRegistry.js";
import { loadConfig } from "../config.js";
import { APIClient } from "../api/client.js";
import { logger } from "../utils/logger.js";
import chalk from "chalk";

interface SyncOptions {
  agentId?: string;
  force?: boolean;
}

export function createSyncCommand(): Command {
  const cmd = new Command("sync");

  cmd
    .description("Manually sync registered agents with marketplace")
    .option("-a, --agent-id <id>", "Sync specific agent ID")
    .option("-f, --force", "Force sync even if agent appears up to date")
    .action(async (options: SyncOptions) => {
      await syncAgents(options);
    });

  return cmd;
}

async function syncAgents(options: SyncOptions): Promise<void> {
  try {
    const config = await loadConfig();
    const client = createPublicClient({
      chain: base,
      transport: http()
    });

    logger.info("Starting marketplace sync...");

    if (options.agentId) {
      await syncSpecificAgent(client, config, options.agentId, options.force);
    } else {
      await syncAllUserAgents(client, config, options.force);
    }

  } catch (error) {
    logger.error("Sync failed:", error);
    process.exit(1);
  }
}

async function syncSpecificAgent(
  client: any,
  config: any,
  agentId: string,
  force?: boolean
): Promise<void> {
  const numericId = parseInt(agentId, 10);
  if (isNaN(numericId)) {
    logger.error("Invalid agent ID format");
    return;
  }

  console.log(chalk.blue(`🔍 Checking agent ${agentId} on-chain...`));

  try {
    const agentData = await readAgentRegistry(client, BigInt(numericId));

    if (!agentData || agentData.owner === "0x0000000000000000000000000000000000000000") {
      console.log(chalk.red(`❌ Agent ${agentId} not found on-chain`));
      return;
    }

    console.log(chalk.green(`✅ Agent found on-chain`));
    console.log(`   Name: ${agentData.name}`);
    console.log(`   Owner: ${agentData.owner}`);
    console.log(`   Created: ${new Date(Number(agentData.createdAt) * 1000).toISOString()}`);

    console.log(chalk.blue(`📡 Syncing with marketplace...`));

    const apiClient = new APIClient(config.api.baseUrl);
    const syncResult = await apiClient.syncAgent(numericId, {
      name: agentData.name,
      owner: agentData.owner,
      description: agentData.description,
      createdAt: Number(agentData.createdAt),
      force: force
    });

    if (syncResult.success) {
      console.log(chalk.green(`✅ Sync completed successfully`));
      console.log(`   Status: ${syncResult.status}`);
      if (syncResult.updated) {
        console.log(`   Updated fields: ${syncResult.updated.join(", ")}`);
      }
      console.log(`   Agent URL: ${config.api.baseUrl}/agents/${agentId}`);
    } else {
      console.log(chalk.yellow(`⚠️  Sync completed with warnings`));
      console.log(`   Message: ${syncResult.message}`);
    }

  } catch (error) {
    if (error instanceof Error && error.message.includes("AgentNotFound")) {
      console.log(chalk.red(`❌ Agent ${agentId} not found on-chain`));
    } else {
      logger.error(`Failed to sync agent ${agentId}:`, error);
    }
  }
}

async function syncAllUserAgents(
  client: any,
  config: any,
  force?: boolean
): Promise<void> {
  if (!config.wallet?.address) {
    logger.error("No wallet address configured");
    return;
  }

  console.log(chalk.blue(`🔍 Finding agents for ${config.wallet.address}...`));

  const apiClient = new APIClient(config.api.baseUrl);
  const userAgents = await apiClient.getUserAgents(config.wallet.address);

  if (userAgents.length === 0) {
    console.log(chalk.yellow("No registered agents found"));
    return;
  }

  console.log(chalk.green(`Found ${userAgents.length} registered agent(s)`));

  for (let i = 0; i < userAgents.length; i++) {
    const agent = userAgents[i];
    console.log(chalk.blue(`\n📊 [${i + 1}/${userAgents.length}] Syncing agent ${agent.id}...`));

    await syncSpecificAgent(client, config, agent.id.toString(), force);

    if (i < userAgents.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  console.log(chalk.green(`\n🎉 Sync completed for all agents`));
}
