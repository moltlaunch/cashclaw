import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface LLMConfig {
  provider: "anthropic" | "openai" | "openrouter" | "claude-cli";
  model: string;
  /** API キーをそのまま保存する場合に使用（非推奨: apiKeyEnvVar を推奨）。 */
  apiKey: string;
  /**
   * API キーを環境変数名で参照する場合に使用。
   * 例: "ANTHROPIC_API_KEY" → 実行時に process.env["ANTHROPIC_API_KEY"] を参照する。
   * apiKey より優先される。
   */
  apiKeyEnvVar?: string;
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

/**
 * LLM の API キーを解決する。
 * apiKeyEnvVar が設定されている場合は環境変数から取得し、
 * そうでない場合は apiKey フィールドを返す。
 */
export function resolveApiKey(llm: LLMConfig): string {
  if (llm.apiKeyEnvVar) {
    return process.env[llm.apiKeyEnvVar] ?? llm.apiKey ?? "";
  }
  return llm.apiKey ?? "";
}

/** Check if config has all required fields for running the agent */
export function isConfigured(): boolean {
  const config = loadConfig();
  if (!config) return false;
  // claude-cli は API キー不要（OAuth認証）
  if (config.llm?.provider === "claude-cli") {
    return Boolean(config.agentId && config.llm?.provider);
  }
  // apiKeyEnvVar が設定されている場合は実行時に解決するとみなす（起動時に env がなくても OK）
  const hasApiKeySource = Boolean(config.llm?.apiKeyEnvVar) || Boolean(resolveApiKey(config.llm));
  return Boolean(config.agentId && hasApiKeySource && config.llm?.provider);
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
  /** API キーを直接指定する場合。apiKeyEnvVar と排他。 */
  apiKey?: string;
  /** API キーを環境変数名で参照する場合（推奨）。例: "ANTHROPIC_API_KEY" */
  apiKeyEnvVar?: string;
  specialties?: string[];
}): CashClawConfig {
  const modelDefaults: Record<LLMConfig["provider"], string> = {
    anthropic: "claude-sonnet-4-20250514",
    openai: "gpt-4o",
    openrouter: "anthropic/claude-sonnet-4-20250514",
    "claude-cli": "claude-sonnet-4-6",
  };

  const llm: LLMConfig = {
    provider: opts.provider,
    model: opts.model ?? modelDefaults[opts.provider],
    apiKey: opts.apiKey ?? "",
    ...(opts.apiKeyEnvVar ? { apiKeyEnvVar: opts.apiKeyEnvVar } : {}),
  };

  const config: CashClawConfig = {
    ...DEFAULT_CONFIG,
    agentId: opts.agentId,
    llm,
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
