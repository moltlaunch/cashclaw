import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolResult } from "./types.js";

const execFileAsync = promisify(execFile);

function safeStringify(data: unknown): string {
  return JSON.stringify(data, (key, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  });
}

const FETCH_TIMEOUT = 60_000;
const BALANCE_TIMEOUT = 15_000;

const ALLOWED_DOMAINS = new Set([
  "stableenrich.dev",
  "twit.sh",
  "stablestudio.dev",
  "stableupload.dev",
  "stableemail.dev",
  "stablesocial.dev",
  "stablephone.dev",
  "stablejobs.dev",
  "stabletravel.dev",
]);

async function runAgentCash<T>(
  args: string[],
  timeout: number,
): Promise<T> {
  try {
    const { stdout } = await execFileAsync("npx", ["agentcash", ...args], {
      timeout,
      env: { ...process.env },
    });
    return JSON.parse(stdout.trim()) as T;
  } catch (err) {
    if (err instanceof Error) {
      if ("code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error("agentcash CLI not found. Install with: npm install -g agentcash");
      }
      throw new Error(`agentcash error: ${err.message}`);
    }
    throw err;
  }
}

export const agentcashFetch: Tool = {
  definition: {
    name: "agentcash_fetch",
    description:
      "Make a paid API call via AgentCash. Constructs a request to an external API endpoint " +
      "(web search, scraping, image gen, social data, email, etc). The URL, method, and body " +
      "should match the endpoint catalog in your instructions. Costs USDC per call.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "Full API endpoint URL (e.g. https://stableenrich.dev/exa/search)",
        },
        method: {
          type: "string",
          enum: ["GET", "POST", "PUT", "DELETE"],
          description: "HTTP method. Defaults to POST if body is provided, GET otherwise.",
        },
        body: {
          type: "object",
          description: "JSON request body for POST/PUT requests.",
        },
      },
      required: ["url"],
    },
  },
  async execute(input): Promise<ToolResult> {
    const url = input.url as string;
    if (!url) return { success: false, data: "Missing required field: url" };

    // Validate URL against allowlist to prevent SSRF
    try {
      const parsed = new URL(url);
      if (!ALLOWED_DOMAINS.has(parsed.hostname)) {
        return { success: false, data: `Blocked: domain ${parsed.hostname} not in allowlist` };
      }
    } catch {
      return { success: false, data: `Invalid URL: ${url}` };
    }

    const method = input.method as string | undefined;
    const body = input.body as Record<string, unknown> | undefined;

    const args = ["fetch", url];
    if (method) {
      args.push("-m", method);
    }
    if (body) {
      args.push("-b", JSON.stringify(body));
    }
    args.push("--format", "json");

    try {
      const result = await runAgentCash<unknown>(args, FETCH_TIMEOUT);
      return { success: true, data: safeStringify(result) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: msg };
    }
  },
};

export interface AgentCashWalletInfo {
  address: string;
  balance: string;
  network: string;
}

export const agentcashBalance: Tool = {
  definition: {
    name: "agentcash_balance",
    description:
      "Check your AgentCash USDC balance. Use before making expensive API calls " +
      "to ensure sufficient funds.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  async execute(_input, _ctx): Promise<ToolResult> {
    try {
      const result = await runAgentCash<AgentCashWalletInfo>(
        ["wallet", "info", "--format", "json"],
        BALANCE_TIMEOUT,
      );
      return {
        success: true,
        data: safeStringify({
          address: result.address,
          balanceUSDC: result.balance,
          network: result.network,
        }),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, data: msg };
    }
  },
};
