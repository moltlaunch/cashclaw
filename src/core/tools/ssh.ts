import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Tool, ToolResult } from "./types.js";

const execAsync = promisify(exec);

/** Maximum time (ms) to wait for an SSH command to complete. */
const SSH_TIMEOUT = 30_000;

export const sshTool: Tool = {
  name: "ssh",
  description:
    "Execute a command on a remote host over SSH. " +
    "Requires host and command at minimum. Optionally provide username " +
    "and key (path to private key). Always requires confirmation.",
  parameters: [
    { name: "host", type: "string", description: "Remote hostname or IP", required: true },
    { name: "command", type: "string", description: "Command to run on the remote host", required: true },
    { name: "username", type: "string", description: "SSH username (defaults to current user)" },
    { name: "key", type: "string", description: "Path to SSH private key file" },
    { name: "port", type: "number", description: "SSH port (default 22)" },
  ],
  requiresConfirmation: true,

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const host = params.host;
    if (typeof host !== "string" || !host.trim()) {
      return { success: false, output: "Missing required parameter: host", error: "missing_param" };
    }

    const command = params.command;
    if (typeof command !== "string" || !command.trim()) {
      return { success: false, output: "Missing required parameter: command", error: "missing_param" };
    }

    // Validate inputs to prevent shell injection via the host/username/key fields.
    const safePattern = /^[a-zA-Z0-9._@:\/~\-]+$/;

    if (!safePattern.test(host.trim())) {
      return { success: false, output: `Invalid host: ${host}`, error: "invalid_param" };
    }

    const username =
      typeof params.username === "string" && params.username.trim()
        ? params.username.trim()
        : undefined;

    if (username && !safePattern.test(username)) {
      return { success: false, output: `Invalid username: ${username}`, error: "invalid_param" };
    }

    const keyPath =
      typeof params.key === "string" && params.key.trim()
        ? params.key.trim()
        : undefined;

    if (keyPath && !safePattern.test(keyPath)) {
      return { success: false, output: `Invalid key path: ${keyPath}`, error: "invalid_param" };
    }

    const port =
      typeof params.port === "number" && Number.isInteger(params.port)
        ? params.port
        : 22;

    // Build SSH command
    const args: string[] = ["ssh", "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=10"];

    if (keyPath) {
      args.push("-i", keyPath);
    }

    if (port !== 22) {
      args.push("-p", String(port));
    }

    const target = username ? `${username}@${host.trim()}` : host.trim();
    args.push(target);

    // The remote command is passed as a single string argument.
    // We escape single quotes for shell safety.
    const escapedCommand = command.replace(/'/g, "'\\''");
    args.push(`'${escapedCommand}'`);

    const sshCommand = args.join(" ");

    try {
      const { stdout, stderr } = await execAsync(sshCommand, {
        timeout: SSH_TIMEOUT,
      });
      const output = [stdout, stderr].filter(Boolean).join("\n").trim();
      return { success: true, output: output || "(no output)" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        output: `SSH command failed: ${msg}`,
        error: "ssh_failed",
      };
    }
  },
};
