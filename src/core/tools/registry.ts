import type { Tool, ToolParam } from "./types.js"

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  register(tool: Tool): void {
    this.tools.set(tool.name, tool)
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  list(): Tool[] {
    return [...this.tools.values()]
  }

  getToolDefinitions(): Array<{ name: string; description: string; parameters: ToolParam[] }> {
    return this.list().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }))
  }
}
