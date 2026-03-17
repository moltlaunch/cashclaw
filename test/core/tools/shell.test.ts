import { describe, it, expect } from "vitest"
import { ShellTool } from "../../../src/core/tools/shell.js"

describe("ShellTool", () => {
  const tool = new ShellTool()

  it("executes command", async () => {
    const result = await tool.execute({ command: "echo hello" })
    expect(result.success).toBe(true)
    expect(result.output.trim()).toBe("hello")
  })

  it("returns error for bad command", async () => {
    const result = await tool.execute({ command: "nonexistent_xyz_cmd" })
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it("blocks dangerous commands", async () => {
    const result = await tool.execute({ command: "rm -rf /" })
    expect(result.success).toBe(false)
    expect(result.error).toContain("blocked")
  })

  it("returns error for missing command", async () => {
    const result = await tool.execute({})
    expect(result.success).toBe(false)
    expect(result.error).toContain("Missing")
  })
})
