import { exec } from "node:child_process"
import type { Tool, ToolResult } from "./types.js"

const BLACKLIST_PATTERNS = ["rm -rf /", "mkfs", "dd if=", "format"]

function isDangerous(command: string): boolean {
  const lower = command.toLowerCase()
  return BLACKLIST_PATTERNS.some((p) => lower.includes(p))
}

export class ShellTool implements Tool {
  name = "shell"
  description = "Execute a shell command"
  parameters = [
    { name: "command", type: "string", description: "The shell command to execute", required: true },
  ]
  requiresConfirmation = true

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const command = params.command
    if (typeof command !== "string" || !command.trim()) {
      return { success: false, output: "", error: "Missing required parameter: command" }
    }

    if (isDangerous(command)) {
      return { success: false, output: "", error: "Command blocked: matches a dangerous pattern" }
    }

    return new Promise((resolve) => {
      exec(command, { timeout: 30_000 }, (err, stdout, stderr) => {
        if (err) {
          resolve({ success: false, output: stderr || stdout || "", error: err.message })
        } else {
          resolve({ success: true, output: stdout, error: stderr || undefined })
        }
      })
    })
  }
}
