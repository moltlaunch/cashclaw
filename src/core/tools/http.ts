import type { Tool, ToolResult } from "./types.js"

export class HttpTool implements Tool {
  name = "http"
  description = "Make HTTP requests"
  parameters = [
    { name: "url", type: "string", description: "The URL to request", required: true },
    { name: "method", type: "string", description: "HTTP method: GET, POST, PUT, or DELETE" },
    { name: "body", type: "string", description: "Request body (for POST/PUT)" },
    { name: "headers", type: "string", description: "JSON-encoded headers object" },
  ]

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string | undefined
    if (!url) {
      return { success: false, output: "", error: "Missing required parameter: url" }
    }

    const method = ((params.method as string) || "GET").toUpperCase()
    const body = params.body as string | undefined

    let headers: Record<string, string> | undefined
    if (params.headers) {
      try {
        headers = typeof params.headers === "string" ? JSON.parse(params.headers) : (params.headers as Record<string, string>)
      } catch {
        return { success: false, output: "", error: "Invalid headers: must be a JSON-encoded object" }
      }
    }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 30_000)

      const response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      })

      clearTimeout(timer)

      const text = await response.text()

      if (!response.ok) {
        return { success: false, output: text, error: `HTTP ${response.status} ${response.statusText}` }
      }

      return { success: true, output: text }
    } catch (err) {
      return { success: false, output: "", error: (err as Error).message }
    }
  }
}
