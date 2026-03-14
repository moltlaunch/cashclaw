/**
 * cashclaw CLI entrypoint
 *
 * Subcommands:
 *   init      -- configure cashclaw from CLI (no web UI)
 *   start     -- start agent daemon (no browser auto-open)
 *   stop      -- stop running daemon
 *   status    -- show current config and daemon status
 *   config    -- show/edit config values
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { loadConfig, saveConfig, initConfig, isConfigured, resolveApiKey, getConfigDir, type LLMConfig } from "./config.js";
import { startAgent } from "./agent.js";

const PID_FILE = path.join(os.homedir(), ".cashclaw", "cashclaw.pid");

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function readPid(): number | null {
  try {
    const raw = fs.readFileSync(PID_FILE, "utf-8").trim();
    const pid = parseInt(raw, 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function writePid(pid: number): void {
  const dir = path.dirname(PID_FILE);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(PID_FILE, String(pid));
}

function removePid(): void {
  try { fs.unlinkSync(PID_FILE); } catch { /* already removed */ }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function parseArgs(argv: string[]): { command: string; flags: Record<string, string>; positional: string[] } {
  const command = argv[0] ?? "help";
  const flags: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      if (val !== undefined) {
        flags[key] = val;
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        flags[key] = argv[++i];
      } else {
        flags[key] = "true";
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, flags, positional };
}

// ──────────────────────────────────────────────────────────────
// Commands
// ──────────────────────────────────────────────────────────────

async function cmdInit(flags: Record<string, string>): Promise<void> {
  console.log("=== CashClaw CLI Init ===\n");

  // Resolve values from flags or environment, falling back to interactive prompts
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    // agentId
    let agentId = flags["agent-id"] ?? flags["agentId"] ?? "";
    if (!agentId) {
      agentId = await prompt(rl, "Agent ID (from mltl agent register): ");
    }
    agentId = agentId.trim();
    if (!agentId) {
      console.error("Error: agentId is required.");
      process.exit(1);
    }

    // LLM provider
    let provider = (flags["provider"] ?? "") as LLMConfig["provider"];
    const validProviders: LLMConfig["provider"][] = ["anthropic", "openai", "openrouter", "claude-cli"];
    if (!validProviders.includes(provider)) {
      const raw = await prompt(rl, "LLM provider [anthropic/openai/openrouter/claude-cli] (default: claude-cli): ");
      provider = (raw.trim() || "claude-cli") as LLMConfig["provider"];
    }

    // claude-cli は API キー不要（OAuth認証）
    if (provider === "claude-cli") {
      // specialties は後で宣言されるため、ここでは flags から直接解析する
      const claudeCliSpecialties = (flags["specialties"] ?? "")
        .split(",").map((s: string) => s.trim()).filter(Boolean);
      const model = flags["model"] ?? "claude-sonnet-4-6";
      const config = initConfig({ agentId, provider, model, apiKey: "", specialties: claudeCliSpecialties });
      console.log(`\nConfig saved to ${getConfigDir()}/cashclaw.json`);
      console.log(`Agent ID: ${config.agentId}`);
      console.log(`Provider: claude-cli (OAuth — no API key needed)`);
      console.log(`\nRun "cashclaw-cli start" to start the agent.`);
      return;
    }

    // API key: 環境変数参照モード（推奨）か直接指定かを選択する
    const envKeyMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
    };
    const defaultEnvVar = envKeyMap[provider];

    // --use-env-key フラグ or --api-key-env-var で環境変数名を指定した場合は
    // API キーをコンフィグに書かず、実行時に環境変数から読む
    const useEnvKey = flags["use-env-key"] === "true" || flags["api-key-env-var"] !== undefined;
    const apiKeyEnvVar = flags["api-key-env-var"] ?? (useEnvKey ? defaultEnvVar : undefined);

    let apiKey = "";
    if (!useEnvKey) {
      // 環境変数を即時解決して apiKey として保存するモード
      const envKey = process.env[defaultEnvVar] ?? "";
      apiKey = flags["api-key"] ?? flags["apiKey"] ?? envKey;
      if (!apiKey) {
        const raw = await prompt(rl, `API key for ${provider} (or press Enter to use $${defaultEnvVar} at runtime): `);
        if (raw.trim() === "") {
          // 空 Enter → 環境変数参照モードに切り替え
          console.log(`→ Using $${defaultEnvVar} at runtime (key not stored in config).`);
          apiKey = "";
        } else {
          apiKey = raw.trim();
        }
      }
      // env var が実行時に存在するなら apiKey が空でも OK
      const resolved = apiKey || process.env[defaultEnvVar] || "";
      if (!resolved) {
        console.error(`Error: API key required. Set $${defaultEnvVar} or pass --api-key.`);
        process.exit(1);
      }
      if (!apiKey) {
        // 空 = 実行時参照モードに自動切替
        apiKey = "";
      }
    } else {
      // 環境変数参照モード: 今すぐ解決できなくても OK（起動時に解決される）
      const currentVal = process.env[apiKeyEnvVar ?? defaultEnvVar] ?? "";
      if (!currentVal) {
        console.warn(`Warning: $${apiKeyEnvVar ?? defaultEnvVar} is not set in the current environment.`);
        console.warn("Make sure it is set when starting cashclaw.");
      } else {
        console.log(`✓ $${apiKeyEnvVar ?? defaultEnvVar} is set (will be read at runtime).`);
      }
    }

    // Model
    const modelDefaults: Record<string, string> = {
      anthropic: "claude-sonnet-4-6",
      openai: "gpt-4o",
      openrouter: "anthropic/claude-sonnet-4-6",
    };
    let model = flags["model"] ?? "";
    if (!model) {
      const defaultModel = modelDefaults[provider];
      const raw = await prompt(rl, `Model (default: ${defaultModel}): `);
      model = raw.trim() || defaultModel;
    }

    // Specialties (optional)
    let specialties: string[] = [];
    const specialtiesFlag = flags["specialties"] ?? "";
    if (specialtiesFlag) {
      specialties = specialtiesFlag.split(",").map((s) => s.trim()).filter(Boolean);
    } else {
      const raw = await prompt(rl, "Specialties (comma-separated, optional): ");
      specialties = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }

    const config = initConfig({
      agentId,
      provider,
      model,
      ...(apiKeyEnvVar ? { apiKeyEnvVar } : { apiKey }),
      specialties,
    });
    console.log(`\nConfig saved to ${getConfigDir()}/cashclaw.json`);
    console.log(`Agent ID: ${config.agentId}`);
    console.log(`Provider: ${config.llm.provider} / ${config.llm.model}`);
    console.log(`\nRun "cashclaw-daemon" or "cashclaw start" to start the agent.`);
  } finally {
    rl.close();
  }
}

async function cmdStart(): Promise<void> {
  if (!isConfigured()) {
    console.error("Error: not configured. Run `cashclaw init` first.");
    process.exit(1);
  }

  // Check if already running
  const existingPid = readPid();
  if (existingPid !== null && isProcessRunning(existingPid)) {
    console.error(`Error: cashclaw is already running (PID ${existingPid}).`);
    process.exit(1);
  }

  console.log("Starting CashClaw daemon...");
  writePid(process.pid);

  const server = await startAgent();

  const shutdown = () => {
    console.log("\nShutting down...");
    removePid();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.on("exit", removePid);

  console.log(`Dashboard: http://localhost:3777`);
  console.log(`PID: ${process.pid} (written to ${PID_FILE})`);
}

function cmdStop(): void {
  const pid = readPid();
  if (pid === null) {
    console.log("cashclaw is not running (no PID file).");
    return;
  }
  if (!isProcessRunning(pid)) {
    console.log(`cashclaw is not running (stale PID ${pid}).`);
    removePid();
    return;
  }
  process.kill(pid, "SIGTERM");
  console.log(`Sent SIGTERM to PID ${pid}.`);
  removePid();
}

function cmdStatus(): void {
  const config = loadConfig();
  const pid = readPid();
  const running = pid !== null && isProcessRunning(pid);

  console.log("=== CashClaw Status ===\n");
  console.log(`Status:   ${running ? `running (PID ${pid})` : "stopped"}`);
  console.log(`Dashboard: ${running ? "http://localhost:3777" : "N/A"}`);
  console.log(`Config:   ${getConfigDir()}/cashclaw.json`);

  if (config) {
    console.log(`\nAgent ID: ${config.agentId}`);
    console.log(`Provider: ${config.llm.provider} / ${config.llm.model}`);
    console.log(`Auto quote: ${config.autoQuote} / Auto work: ${config.autoWork}`);
    console.log(`Max concurrent tasks: ${config.maxConcurrentTasks}`);
    if (config.specialties.length > 0) {
      console.log(`Specialties: ${config.specialties.join(", ")}`);
    }
  } else {
    console.log("\nNot configured. Run `cashclaw init` first.");
  }
}

function cmdConfigShow(): void {
  const config = loadConfig();
  if (!config) {
    console.log("Not configured. Run `cashclaw init` first.");
    return;
  }
  // Redact API key
  const display = { ...config, llm: { ...config.llm, apiKey: "***" } };
  console.log(JSON.stringify(display, null, 2));
}

function printHelp(): void {
  console.log(`
cashclaw-cli — CashClaw CLI mode

Usage:
  cashclaw-cli init [OPTIONS]    Configure cashclaw (no browser required)
  cashclaw-cli start             Start agent daemon (no browser auto-open)
  cashclaw-cli stop              Stop running daemon
  cashclaw-cli status            Show config and daemon status
  cashclaw-cli config show       Show current config (API key redacted)

Init options:
  --agent-id ID          Agent ID (from moltlaunch registration)
  --provider PROVIDER    LLM provider: anthropic | openai | openrouter
  --api-key KEY          API key (store directly in config)
  --use-env-key          Don't store API key; read from env var at runtime (recommended)
  --api-key-env-var VAR  Env var name to read API key from (implies --use-env-key)
  --model MODEL          LLM model name
  --specialties LIST     Comma-separated specialties

Environment variables:
  ANTHROPIC_API_KEY      Auto-used when provider=anthropic (direct or via --use-env-key)
  OPENAI_API_KEY         Auto-used when provider=openai
  OPENROUTER_API_KEY     Auto-used when provider=openrouter

Examples:
  # agent-gateway の認証情報を使う（APIキーをコンフィグに書かない）
  cashclaw-cli init --agent-id <id> --provider anthropic --use-env-key

  # APIキーを直接指定
  cashclaw-cli init --agent-id <id> --provider anthropic --api-key sk-ant-...
`);
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { command, flags, positional } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "init":
      await cmdInit(flags);
      break;

    case "start":
      await cmdStart();
      break;

    case "stop":
      cmdStop();
      break;

    case "status":
      cmdStatus();
      break;

    case "config":
      if (positional[0] === "show" || flags["show"] === "true") {
        cmdConfigShow();
      } else {
        printHelp();
      }
      break;

    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
