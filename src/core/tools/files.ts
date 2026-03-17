import { readFile, writeFile, readdir } from "node:fs/promises"
import type { Tool, ToolResult } from "./types.js"

export class FilesTool implements Tool {
  name = "files"
  description = "Read, write, or list files"
  parameters = [
    { name: "action", type: "string", description: "Action to perform: read, write, or list", required: true },
    { name: "path", type: "string", description: "File or directory path", required: true },
    { name: "content", type: "string", description: "Content to write (required for write action)" },
  ]

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const action = params.action as string | undefined
    const path = params.path as string | undefined

    if (!action || !path) {
      return { success: false, output: "", error: "Missing required parameters: action and path" }
    }

    switch (action) {
      case "read":
        return this.read(path)
      case "write":
        return this.write(path, params.content as string | undefined)
      case "list":
        return this.list(path)
      default:
        return { success: false, output: "", error: `Unknown action: ${action}. Use read, write, or list.` }
    }
  }

  private async read(path: string): Promise<ToolResult> {
    try {
      const data = await readFile(path, "utf-8")
      return { success: true, output: data }
    } catch (err) {
      return { success: false, output: "", error: (err as Error).message }
    }
  }

  private async write(path: string, content: string | undefined): Promise<ToolResult> {
    if (content === undefined) {
      return { success: false, output: "", error: "Missing required parameter: content (for write action)" }
    }
    try {
      await writeFile(path, content, "utf-8")
      return { success: true, output: `Written to ${path}` }
    } catch (err) {
      return { success: false, output: "", error: (err as Error).message }
    }
  }

  private async list(path: string): Promise<ToolResult> {
    try {
      const entries = await readdir(path)
      return { success: true, output: entries.join("\n") }
    } catch (err) {
      return { success: false, output: "", error: (err as Error).message }
    }
  }
}
