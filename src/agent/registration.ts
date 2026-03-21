import type { CashClawConfig } from "../config.js";
import { Connection, PublicKey } from "@solana/web3.js";

export interface AgentRegistrationStatus {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  diagnostics: AgentDiagnostics;
}

export interface AgentDiagnostics {
  walletAddress?: string;
  walletBalance?: number;
  endpointReachable: boolean;
  configurationValid: boolean;
  moltlaunchVisible: boolean;
  agentId?: string;
  registrationTimestamp?: number;
}

export interface MoltLaunchAgent {
  id: string;
  agentIdBigInt: string;
  owner: string;
  agentURI: string;
  agentWallet: string;
  name: string;
  description: string;
  skills: string[];
}

export class AgentRegistrationValidator {
  private config: CashClawConfig;
  private connection: Connection;

  constructor(config: CashClawConfig) {
    this.config = config;
    this.connection = new Connection(config.solanaRpcUrl);
  }

  async validateRegistration(): Promise<AgentRegistrationStatus> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const diagnostics: AgentDiagnostics = {
      endpointReachable: false,
      configurationValid: false,
      moltlaunchVisible: false,
    };

    // Validate wallet configuration
    try {
      if (!this.config.walletPrivateKey) {
        errors.push("Wallet private key not configured");
      } else {
        const walletPublicKey = new PublicKey(this.config.walletAddress);
        diagnostics.walletAddress = walletPublicKey.toBase58();

        const balance = await this.connection.getBalance(walletPublicKey);
        diagnostics.walletBalance = balance / 1e9; // Convert lamports to SOL

        if (balance === 0) {
          warnings.push("Wallet has zero SOL balance - may need funds for transactions");
        }
      }
    } catch (error) {
      errors.push(`Invalid wallet configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate endpoint connectivity
    try {
      const response = await fetch(`${this.config.apiEndpoint}/health`);
      if (response.ok) {
        diagnostics.endpointReachable = true;
      } else {
        errors.push(`Agent endpoint returned status ${response.status}`);
      }
    } catch (error) {
      errors.push(`Cannot reach agent endpoint: ${error instanceof Error ? error.message : 'Connection failed'}`);
    }

    // Validate basic configuration
    const configErrors = this.validateConfiguration();
    errors.push(...configErrors);
    diagnostics.configurationValid = configErrors.length === 0;

    // Check MoltLaunch visibility
    try {
      const moltlaunchStatus = await this.checkMoltLaunchVisibility();
      diagnostics.moltlaunchVisible = moltlaunchStatus.visible;
      diagnostics.agentId = moltlaunchStatus.agentId;
      diagnostics.registrationTimestamp = moltlaunchStatus.timestamp;

      if (!moltlaunchStatus.visible) {
        if (moltlaunchStatus.reason) {
          errors.push(`Agent not visible in MoltLaunch: ${moltlaunchStatus.reason}`);
        } else {
          errors.push("Agent not found in MoltLaunch registry");
        }
      }
    } catch (error) {
      warnings.push(`Could not verify MoltLaunch status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      diagnostics,
    };
  }

  private validateConfiguration(): string[] {
    const errors: string[] = [];

    if (!this.config.agentName?.trim()) {
      errors.push("Agent name is required");
    }

    if (!this.config.agentDescription?.trim()) {
      errors.push("Agent description is required");
    }

    if (!this.config.apiEndpoint?.trim()) {
      errors.push("API endpoint is required");
    } else {
      try {
        new URL(this.config.apiEndpoint);
      } catch {
        errors.push("API endpoint must be a valid URL");
      }
    }

    if (!this.config.moltlaunchApiUrl?.trim()) {
      errors.push("MoltLaunch API URL is required");
    }

    if (!Array.isArray(this.config.skills) || this.config.skills.length === 0) {
      errors.push("At least one skill must be configured");
    }

    return errors;
  }

  private async checkMoltLaunchVisibility(): Promise<{
    visible: boolean;
    agentId?: string;
    timestamp?: number;
    reason?: string;
  }> {
    if (!this.config.walletAddress) {
      return { visible: false, reason: "Wallet address not configured" };
    }

    try {
      const response = await fetch(`${this.config.moltlaunchApiUrl}/agents?wallet=${this.config.walletAddress}`);

      if (!response.ok) {
        return { visible: false, reason: `MoltLaunch API error: ${response.status}` };
      }

      const data = await response.json();
      const agents: MoltLaunchAgent[] = data.agents || [];

      const matchingAgent = agents.find(agent =>
        agent.agentWallet.toLowerCase() === this.config.walletAddress.toLowerCase()
      );

      if (matchingAgent) {
        return {
          visible: true,
          agentId: matchingAgent.id,
          timestamp: Date.now(),
        };
      }

      // Check if owner field indicates zero address (common registration issue)
      const zeroAddressAgent = agents.find(agent =>
        agent.owner === "0x0000000000000000000000000000000000000000"
      );

      if (zeroAddressAgent) {
        return {
          visible: false,
          reason: "Agent registration incomplete - owner address is zero. Check registration transaction status."
        };
      }

      return { visible: false, reason: "Agent not found in registry" };
    } catch (error) {
      throw new Error(`Failed to check MoltLaunch: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateDiagnosticReport(): Promise<string> {
    const status = await this.validateRegistration();
    const { diagnostics, errors, warnings } = status;

    let report = "=== CASHCLAW AGENT DIAGNOSTIC REPORT ===\n\n";

    report += `Status: ${status.isValid ? "✅ VALID" : "❌ ISSUES FOUND"}\n`;
    report += `Timestamp: ${new Date().toISOString()}\n\n`;

    // Configuration
    report += "CONFIGURATION:\n";
    report += `- Agent Name: ${this.config.agentName || "NOT SET"}\n`;
    report += `- Description: ${this.config.agentDescription ? "Set" : "NOT SET"}\n`;
    report += `- Skills: ${this.config.skills?.length || 0} configured\n`;
    report += `- API Endpoint: ${this.config.apiEndpoint || "NOT SET"}\n\n`;

    // Wallet info
    report += "WALLET:\n";
    if (diagnostics.walletAddress) {
      report += `- Address: ${diagnostics.walletAddress}\n`;
      report += `- Balance: ${diagnostics.walletBalance?.toFixed(4) || "0"} SOL\n`;
    } else {
      report += "- NOT CONFIGURED\n";
    }
    report += "\n";

    // Connectivity
    report += "CONNECTIVITY:\n";
    report += `- Agent Endpoint: ${diagnostics.endpointReachable ? "✅ Reachable" : "❌ Unreachable"}\n`;
    report += `- MoltLaunch Visible: ${diagnostics.moltlaunchVisible ? "✅ Yes" : "❌ No"}\n`;
    if (diagnostics.agentId) {
      report += `- Agent ID: ${diagnostics.agentId}\n`;
    }
    report += "\n";

    // Errors
    if (errors.length > 0) {
      report += "ERRORS:\n";
      errors.forEach(error => report += `❌ ${error}\n`);
      report += "\n";
    }

    // Warnings
    if (warnings.length > 0) {
      report += "WARNINGS:\n";
      warnings.forEach(warning => report += `⚠️ ${warning}\n`);
      report += "\n";
    }

    // Troubleshooting steps
    if (!status.isValid) {
      report += "TROUBLESHOOTING STEPS:\n";

      if (!diagnostics.configurationValid) {
        report += "1. Fix configuration errors listed above\n";
      }

      if (!diagnostics.endpointReachable) {
        report += "2. Ensure your agent server is running and accessible\n";
        report += "3. Check firewall settings and port configuration\n";
      }

      if (!diagnostics.moltlaunchVisible) {
        report += "4. Verify agent registration transaction was successful\n";
        report += "5. Check if registration is still pending confirmation\n";
        report += "6. Ensure wallet has sufficient SOL for registration fees\n";
      }

      report += "\n";
    }

    return report;
  }
}

export async function validateAgentRegistration(config: CashClawConfig): Promise<AgentRegistrationStatus> {
  const validator = new AgentRegistrationValidator(config);
  return await validator.validateRegistration();
}

export async function troubleshootAgent(config: CashClawConfig): Promise<void> {
  const validator = new AgentRegistrationValidator(config);
  const report = await validator.generateDiagnosticReport();
  console.log(report);
}
