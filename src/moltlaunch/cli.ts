import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Task, Bounty, WalletInfo, RegisterResult, AgentInfo } from "./types.js";

const execFileAsync = promisify(execFile);

const MLTL_BIN = "mltl";
const DEFAULT_TIMEOUT = 30_000;
const REGISTER_TIMEOUT = 120_000;

// HIGH FIX: Add argument validation to prevent command injection
function validateArg(arg: string, argName: string): void {
  // Allow alphanumeric, dash, dot, underscore, at-sign, space - safe for shell
  const allowedPattern = /^[a-zA-Z0-9\-_@. ]*$/;
  if (!allowedPattern.test(arg)) {
    throw new Error(`Invalid characters in ${argName}. Only alphanumeric, dash, underscore, space, dot, @ allowed.`);
  }
  // Prevent args that look like flags or contain shell operators
  if (arg.startsWith('-') || arg.includes(';') || arg.includes('&') || arg.includes('|') || arg.includes('`') || arg.includes('$')) {
    throw new Error(`Potentially unsafe ${argName}: ${arg.slice(0, 50)}`);
  }
}

function validateArgs(args: string[], context: string): void {
  for (const arg of args) {
    if (typeof arg !== 'string') {
      throw new Error(`Non-string argument in ${context}: ${typeof arg}`);
    }
    validateArg(arg, `${context} argument`);
  }
}

interface CliError {
  error: string;
  code?: string;
}

async function mltl<T>(
  args: string[],
  timeout = DEFAULT_TIMEOUT,
): Promise<T> {
  try {
    // HIGH FIX: Validate all arguments to prevent command injection
    validateArgs(args, "mltl command");
    
    // --json is a per-subcommand flag, appended at the end
    const { stdout } = await execFileAsync(MLTL_BIN, [...args, "--json"], {
      timeout,
      env: { ...process.env },
    });

    const parsed = JSON.parse(stdout.trim()) as T | CliError;

    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "error" in parsed &&
      typeof (parsed as CliError).error === "string"
    ) {
      throw new Error((parsed as CliError).error);
    }

    return parsed as T;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("mltl")) {
      throw err;
    }
    if (err instanceof Error) {
      if ("code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(
          "mltl CLI not found. Install it with: npm install -g @moltlaunch/cli",
        );
      }
      throw new Error(`mltl error: ${err.message}`);
    }
    throw err;
  }
}

// --- Setup ---

export async function walletShow(): Promise<WalletInfo> {
  return mltl<WalletInfo>(["wallet", "show"]);
}

export async function walletImport(key: string): Promise<WalletInfo> {
  return mltl<WalletInfo>(["wallet", "import", "--key", key]);
}

export interface RegisterOpts {
  name: string;
  description: string;
  skills: string[];
  price: string;
  symbol?: string;
  token?: string;
  image?: string;
  website?: string;
}

export async function registerAgent(opts: RegisterOpts): Promise<RegisterResult> {
  const args = [
    "register",
    "--name", opts.name,
    "--description", opts.description,
    "--skills", opts.skills.join(","),
    "--price", opts.price,
  ];
  if (opts.symbol) {
    args.push("--symbol", opts.symbol);
  }
  if (opts.token) {
    args.push("--token", opts.token);
  }
  if (opts.image) {
    args.push("--image", opts.image);
  }
  if (opts.website) {
    args.push("--website", opts.website);
  }
  return mltl<RegisterResult>(args, REGISTER_TIMEOUT);
}

// --- Agent lookup ---

export async function getAgentByWallet(address: string): Promise<AgentInfo | null> {
  try {
    const res = await fetch(
      `https://api.moltlaunch.com/api/agents/by-wallet/${address}`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { agents: Record<string, unknown>[] };
    const raw = data.agents[0];
    if (!raw) return null;
    return {
      agentId: String(raw.id ?? raw.agentId ?? ""),
      name: String(raw.name ?? ""),
      description: String(raw.description ?? ""),
      skills: Array.isArray(raw.skills) ? raw.skills as string[] : [],
      priceEth: String(raw.priceWei ?? raw.priceEth ?? "0"),
      owner: String(raw.owner ?? ""),
      flaunchToken: raw.flaunchToken ? String(raw.flaunchToken) : undefined,
      reputation: typeof raw.reputation === "object" && raw.reputation !== null
        ? (raw.reputation as { count?: number }).count
        : undefined,
    };
  } catch {
    return null;
  }
}

// --- Task operations ---

export async function getInbox(agentId?: string): Promise<Task[]> {
  const args = ["inbox"];
  if (agentId) args.push("--agent", agentId);
  const result = await mltl<{ tasks: Task[] }>(args);
  return result.tasks;
}

export async function getTask(taskId: string): Promise<Task> {
  const result = await mltl<{ task: Task }>(["view", "--task", taskId]);
  return result.task;
}

export async function quoteTask(
  taskId: string,
  priceEth: string,
  message?: string,
): Promise<void> {
  const args = ["quote", "--task", taskId, "--price", priceEth];
  if (message) args.push("--message", message);
  await mltl<unknown>(args);
}

export async function declineTask(
  taskId: string,
  reason?: string,
): Promise<void> {
  const args = ["decline", "--task", taskId];
  if (reason) args.push("--reason", reason);
  await mltl<unknown>(args);
}

export async function submitWork(
  taskId: string,
  result: string,
): Promise<void> {
  await mltl<unknown>(["submit", "--task", taskId, "--result", result]);
}

export async function sendMessage(
  taskId: string,
  content: string,
): Promise<void> {
  await mltl<unknown>(["message", "--task", taskId, "--content", content]);
}

export async function getBounties(): Promise<Bounty[]> {
  const result = await mltl<{ bounties: Bounty[] }>(["bounty", "browse"]);
  return result.bounties;
}

export async function claimBounty(
  taskId: string,
  message?: string,
): Promise<void> {
  const args = ["bounty", "claim", "--task", taskId];
  if (message) args.push("--message", message);
  await mltl<unknown>(args);
}
