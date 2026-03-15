import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface LLMConfig {
  provider: "anthropic" | "openai" | "openrouter" | "minimax";
  model: string;
  apiKey: string;
}

export interface PricingConfig {
  strategy: "fixed" | "complexity";
  baseRateEth: string;
  maxRateEth: string;
}

export interface PollingConfig {
  intervalMs: number;
  urgentIntervalMs: number;
}

export interface PersonalityConfig {
  tone: "professional" | "casual" | "friendly" | "technical";
  responseStyle: "concise" | "detailed" | "balanced";
  customInstructions?: string;
}

export interface CashClawConfig {
  agentId: string;
  llm: LLMConfig;
  polling: PollingConfig;
  pricing: PricingConfig;
  specialties: string[];
  autoQuote: boolean;
  autoWork: boolean;
  maxConcurrentTasks: number;
  maxLoopTurns?: number;
  declineKeywords: string[];
  personality?: PersonalityConfig;
  learningEnabled: boolean;
  studyIntervalMs: number;
  agentCashEnabled: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), ".cashclaw");
const CONFIG_PATH = path.join(CONFIG_DIR, "cashclaw.json");

const DEFAULT_CONFIG: Omit<CashClawConfig, "agentId" | "llm"> = {
  polling: { intervalMs: 30000, urgentIntervalMs: 10000 },
  pricing: { strategy: "fixed", baseRateEth: "0.005", maxRateEth: "0.05" },
  specialties: [],
  autoQuote: true,
  autoWork: true,
  maxConcurrentTasks: 3,
  declineKeywords: [],
  learningEnabled: true,
  studyIntervalMs: 1_800_000, // 30 minutes
  agentCashEnabled: false,
};

export function loadConfig(): CashClawConfig | null {
  if (!fs.existsSync(CONFIG_PATH)) return null;
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as CashClawConfig;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function requireConfig(): CashClawConfig {
  const config = loadConfig();
  if (!config) {
    throw new Error(
      "No config found. Run `cashclaw init` first.",
    );
  }
  return config;
}

export function saveConfig(config: CashClawConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  fs.chmodSync(CONFIG_PATH, 0o600);
}

/** Check if config has all required fields for running the agent */
export function isConfigured(): boolean {
  const config = loadConfig();
  if (!config) return false;
  return Boolean(config.agentId && config.llm?.apiKey && config.llm?.provider);
}

/** Save partial config fields, merging with existing config or defaults */
export function savePartialConfig(partial: Partial<CashClawConfig>): CashClawConfig {
  const existing = loadConfig();
  const config = {
    ...DEFAULT_CONFIG,
    agentId: "",
    llm: { provider: "anthropic" as const, model: "", apiKey: "" },
    ...existing,
    ...partial,
  };
  saveConfig(config);
  return config;
}

export function initConfig(opts: {
  agentId: string;
  provider: LLMConfig["provider"];
  model?: string;
  apiKey: string;
  specialties?: string[];
}): CashClawConfig {
  const modelDefaults: Record<LLMConfig["provider"], string> = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
    openrouter: "anthropic/claude-sonnet-4-20250514",
    minimax: "MiniMax-M2.5",
  };

  const config: CashClawConfig = {
    ...DEFAULT_CONFIG,
    agentId: opts.agentId,
    llm: {
      provider: opts.provider,
      model: opts.model ?? modelDefaults[opts.provider],
      apiKey: opts.apiKey,
    },
    specialties: opts.specialties ?? [],
  };

  saveConfig(config);
  return config;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

/** Check if AgentCash CLI wallet exists on disk */
export function isAgentCashAvailable(): boolean {
  const walletPath = path.join(os.homedir(), ".agentcash", "wallet.json");
  return fs.existsSync(walletPath);
}
