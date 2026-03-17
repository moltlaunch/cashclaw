import type { Browser, BrowserContext, Page } from "playwright";
import type { Tool, ToolParam, ToolResult } from "./types.js";

type BrowserAction = "get_text" | "screenshot" | "search" | "click" | "fill" | "evaluate";

const TIMEOUT = 30_000;

const PARAMETERS: ToolParam[] = [
  { name: "action", type: "string", description: "Action to perform: get_text, screenshot, search, click, fill, evaluate", required: true },
  { name: "url", type: "string", description: "URL to navigate to" },
  { name: "selector", type: "string", description: "CSS selector for click/fill actions" },
  { name: "value", type: "string", description: "Value for fill/search actions" },
  { name: "script", type: "string", description: "JavaScript to evaluate on the page" },
];

export class BrowserTool implements Tool {
  readonly name = "browser";
  readonly description = "Browse the web — open pages, search, take screenshots";
  readonly parameters = PARAMETERS;

  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const action = params.action as BrowserAction | undefined;
    if (!action) {
      return { success: false, output: "", error: "Missing required parameter: action" };
    }

    try {
      const page = await this.getPage();

      switch (action) {
        case "get_text":
          return await this.getText(page, params.url as string | undefined);
        case "screenshot":
          return await this.screenshot(page, params.url as string | undefined);
        case "search":
          return await this.search(page, params.value as string | undefined);
        case "click":
          return await this.click(page, params.selector as string | undefined);
        case "fill":
          return await this.fill(page, params.selector as string | undefined, params.value as string | undefined);
        case "evaluate":
          return await this.evaluateScript(page, params.script as string | undefined);
        default:
          return { success: false, output: "", error: `Unknown action: ${action}` };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, output: "", error: message };
    }
  }

  async dispose(): Promise<void> {
    const browser = this.browser;
    this.page = null;
    this.context = null;
    this.browser = null;
    if (browser) {
      await browser.close();
    }
  }

  // ---- private ----------------------------------------------------------

  private async getPage(): Promise<Page> {
    if (this.page) return this.page;

    const { chromium } = await import("playwright");

    try {
      this.browser = await chromium.launch({ headless: true });
    } catch {
      // Chromium not installed — attempt auto-install
      const { execSync } = await import("child_process");
      execSync("npx playwright install chromium", { stdio: "pipe", timeout: 120_000 });
      this.browser = await chromium.launch({ headless: true });
    }

    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(TIMEOUT);
    return this.page;
  }

  private async getText(page: Page, url: string | undefined): Promise<ToolResult> {
    if (!url) return { success: false, output: "", error: "Missing required parameter: url" };
    await page.goto(url, { timeout: TIMEOUT, waitUntil: "domcontentloaded" });
    const text = await page.textContent("body") ?? "";
    return { success: true, output: text.replace(/\s+/g, " ").trim() };
  }

  private async screenshot(page: Page, url: string | undefined): Promise<ToolResult> {
    if (!url) return { success: false, output: "", error: "Missing required parameter: url" };
    await page.goto(url, { timeout: TIMEOUT, waitUntil: "domcontentloaded" });
    const buffer = await page.screenshot({ fullPage: true });
    return { success: true, output: buffer.toString("base64") };
  }

  private async search(page: Page, query: string | undefined): Promise<ToolResult> {
    if (!query) return { success: false, output: "", error: "Missing required parameter: value (search query)" };
    const encoded = encodeURIComponent(query);
    await page.goto(`https://www.google.com/search?q=${encoded}`, { timeout: TIMEOUT, waitUntil: "domcontentloaded" });

    const results = await page.evaluate(() => {
      const items: { title: string; url: string; snippet: string }[] = [];
      document.querySelectorAll("div.g").forEach((el) => {
        const anchor = el.querySelector("a");
        const title = el.querySelector("h3")?.textContent ?? "";
        const snippet = el.querySelector("[data-sncf]")?.textContent
          ?? el.querySelector(".VwiC3b")?.textContent
          ?? "";
        if (anchor?.href && title) {
          items.push({ title, url: anchor.href, snippet });
        }
      });
      return items.slice(0, 10);
    });

    const formatted = results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n\n");
    return { success: true, output: formatted || "No results found" };
  }

  private async click(page: Page, selector: string | undefined): Promise<ToolResult> {
    if (!selector) return { success: false, output: "", error: "Missing required parameter: selector" };
    await page.click(selector, { timeout: TIMEOUT });
    return { success: true, output: `Clicked: ${selector}` };
  }

  private async fill(page: Page, selector: string | undefined, value: string | undefined): Promise<ToolResult> {
    if (!selector) return { success: false, output: "", error: "Missing required parameter: selector" };
    if (value === undefined) return { success: false, output: "", error: "Missing required parameter: value" };
    await page.fill(selector, value, { timeout: TIMEOUT });
    return { success: true, output: `Filled ${selector} with value` };
  }

  private async evaluateScript(page: Page, script: string | undefined): Promise<ToolResult> {
    if (!script) return { success: false, output: "", error: "Missing required parameter: script" };
    const result = await page.evaluate(script);
    if (result === undefined || result === null) return { success: true, output: "" };
    const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);
    return { success: true, output };
  }
}
