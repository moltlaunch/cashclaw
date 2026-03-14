import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolResult } from "./types.js";

const execFileAsync = promisify(execFile);

const FETCH_TIMEOUT = 60_000;
const BALANCE_TIMEOUT = 15_000;
const MAX_BODY_SIZE = 1048576; // 1MB limit for JSON body

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

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);

// HIGH FIX: Enhanced URL validation to prevent SSRF and command injection
function validateUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(url);
    
    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: `Invalid protocol: ${parsed.protocol}` };
    }
    
    // Check for IP addresses (prevent bypass via IP)
    const ipv4Pattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    const ipv6Pattern = /^\[?[0-9a-fA-F:]+\]?$/;
    if (ipv4Pattern.test(parsed.hostname) || ipv6Pattern.test(parsed.hostname)) {
      return { valid: false, error: `IP addresses not allowed: ${parsed.hostname}` };
    }
    
    // Check against domain allowlist
    if (!ALLOWED_DOMAINS.has(parsed.hostname)) {
      return { valid: false, error: `Domain ${parsed.hostname} not in allowlist` };
    }
    
    // Prevent dangerous characters in URL
    const dangerousChars = /[;`$|&<>]/;
    if (dangerousChars.test(url)) {
      return { valid: false, error: `URL contains dangerous characters` };
    }
    
    return { valid: true };
  } catch (e) {
    return { valid: false, error: `Invalid URL format: ${e instanceof Error ? e.message : 'unknown error'}` };
  }
}

// HIGH FIX: Argument validation to prevent command injection  
function validateArg(arg: string): boolean {
  // Only allow safe characters in CLI arguments
  const safePattern = /^[a-zA-Z0-9\-_@./:=?&%+]*$/;
  return safePattern.test(arg);
}

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

    // HIGH FIX: Enhanced URL validation to prevent SSRF and command injection
    const urlValidation = validateUrl(url);
    if (!urlValidation.valid) {
      return { success: false, data: `URL validation failed: ${urlValidation.error}` };
    }

    const method = input.method as string | undefined;
    const body = input.body as Record<string, unknown> | undefined;

    // HIGH FIX: Validate method against allowlist
    if (method && !ALLOWED_METHODS.has(method.toUpperCase())) {
      return { success: false, data: `Invalid HTTP method: ${method}` };
    }

    // HIGH FIX: Validate body size to prevent memory issues
    let bodyStr: string | undefined;
    if (body) {
      try {
        bodyStr = JSON.stringify(body);
        if (bodyStr.length > MAX_BODY_SIZE) {
          return { success: false, data: `Body too large: ${bodyStr.length} bytes (max ${MAX_BODY_SIZE})` };
        }
      } catch (e) {
        return { success: false, data: `Invalid body JSON: ${e instanceof Error ? e.message : 'unknown error'}` };
      }
    }

    const args = ["fetch"];
    
    // HIGH FIX: Validate all arguments for command injection prevention
    if (!validateArg(url)) {
      return { success: false, data: "URL contains unsafe characters for CLI execution" };
    }
    args.push(url);
    
    if (method) {
      const safeMethod = method.toUpperCase();
      if (!validateArg(safeMethod)) {
        return { success: false, data: "Method contains unsafe characters" };
      }
      args.push("-m", safeMethod);
    }
    
    if (bodyStr) {
      args.push("-b", bodyStr);
    }
    args.push("--format", "json");

    try {
      const result = await runAgentCash<unknown>(args, FETCH_TIMEOUT);
      return { success: true, data: JSON.stringify(result, null, 2) };
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
        data: JSON.stringify({
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
