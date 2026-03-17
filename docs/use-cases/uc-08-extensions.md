# UC-08: Developer Extensions

**Actor:** Developer
**Goal:** Extend Betsy with custom integrations — a different task source, new agent tools, Telegram bot plugins, or a new LLM provider

---

## UC-08-A: Replace the Marketplace Integration

**Actor:** Developer
**Goal:** Connect Betsy to a task source other than Moltlaunch (e.g., Fiverr, Upwork, a file watcher, a webhook endpoint, or an email inbox)
**Preconditions:**
- Betsy source code is available locally
- The target task source has an accessible API or interface

### Main Success Scenario
1. Developer copies `src/moltlaunch/cli.ts` as a starting point and creates a new file (e.g., `src/fiverr/cli.ts`).
2. Developer implements the seven functions that the rest of Betsy calls:
   - `getInbox()` — return pending tasks as `Task[]`
   - `getTask(taskId)` — return full task details
   - `quoteTask(taskId, priceEth, message?)` — submit a price quote
   - `declineTask(taskId, reason?)` — decline a task with an optional reason
   - `submitWork(taskId, result)` — deliver the completed work
   - `sendMessage(taskId, content)` — send a message on a task thread
   - `walletShow()` — return wallet address and balance
3. Developer updates `src/tools/marketplace.ts` to import from the new client instead of `../moltlaunch/cli.js`.
4. Developer rebuilds (`npm run build`) and restarts Betsy.
5. Betsy polls the new source, processes tasks through the unchanged LLM loop, and delivers results via the new client.

### Alternative Flows
- **A1 (file watcher):** `getInbox()` reads `.json` files from a local directory. `submitWork()` writes result files alongside the input. No network calls needed.
- **A2 (webhook endpoint):** `getInbox()` queries a REST API. `submitWork()` POSTs to a callback URL included in the task payload.
- **A3 (email inbox):** `getInbox()` fetches unread messages via IMAP. `sendMessage()` sends a reply; `submitWork()` sends the deliverable as an attachment.

### Postconditions
- Betsy accepts tasks from the new source and delivers results through it.
- The LLM loop, memory, learning, and AgentCash subsystems are unaffected.

---

## UC-08-B: Add a Custom Tool

**Actor:** Developer
**Goal:** Give the agent a new capability (e.g., web scraping, PDF reading, database query, image analysis) that the LLM can invoke during task work
**Preconditions:**
- Betsy source code is available locally

### Main Success Scenario
1. Developer creates a new file under `src/tools/` (e.g., `src/tools/pdf-reader.ts`).
2. Developer defines a `Tool` object that satisfies the interface from `src/tools/types.ts`:
   ```typescript
   interface Tool {
     definition: ToolDefinition  // name, description, input_schema
     execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>
   }
   ```
3. Developer writes the `execute` function. `ToolContext` provides `config` and `taskId`; the function returns `{ success: boolean, data: string }`.
4. Developer opens `src/tools/registry.ts`, imports the new tool, and adds it to the `BASE_TOOLS` array.
5. Developer rebuilds and restarts Betsy.
6. On the next task run, the LLM receives the new tool in its tool list and calls it when appropriate.

### Alternative Flows
- **A1 (conditional availability):** If the tool requires an external credential (e.g., an API key), developer adds a flag to `CashClawConfig` and conditionally includes the tool in `buildToolMap()`, similar to how `AGENTCASH_TOOLS` are gated by `agentCashEnabled`.

### Postconditions
- The new tool appears in the agent's tool list for every subsequent task.
- Other tools and the existing tool registry are unchanged.

---

## UC-08-C: Add a Telegram Bot Plugin

**Actor:** Developer
**Goal:** Extend the Telegram bot with new message handlers or commands (e.g., voice transcription, image generation, a code sandbox)
**Preconditions:**
- Betsy is configured and running with Telegram integration enabled
- Plugin is either an npm package or a local directory

### Main Success Scenario
1. Developer creates a plugin module that exports a `BetsyPlugin` object:
   ```typescript
   {
     name: string
     handlers: MessageHandler[]   // handle specific Telegram message types
     commands?: BotCommand[]      // register slash commands with the bot
   }
   ```
2. Developer publishes the plugin as an npm package or places it in a local directory.
3. Developer adds the plugin to `betsy.config.yaml` under the `plugins:` key (package name or local path).
4. Developer restarts Betsy.
5. The plugin registry (`src/telegram/plugins/registry.ts`) loads the plugin at startup.
6. Incoming Telegram messages and commands are dispatched to the plugin's handlers.

### Alternative Flows
- **A1 (local development):** Developer specifies a relative path (`./my-plugin`) in `plugins:` instead of an npm package name.
- **A2 (multiple plugins):** Multiple entries under `plugins:` are each loaded in order. Handlers from all plugins are registered and run independently.

### Postconditions
- The Telegram bot responds to the new message types and commands defined by the plugin.
- Core agent behavior (task polling, LLM loop) is unaffected.

---

## UC-08-D: Add a New LLM Provider

**Actor:** Developer
**Goal:** Connect Betsy to an LLM not already supported (e.g., Google Gemini, Mistral, a local Ollama instance)
**Preconditions:**
- Betsy source code is available locally
- The target LLM exposes an HTTP API

### Main Success Scenario
1. Developer opens `src/llm/index.ts` and writes a new factory function that returns an `LLMProvider`:
   ```typescript
   interface LLMProvider {
     chat(messages: LLMMessage[], tools?: ToolDefinition[]): Promise<LLMResponse>
   }
   ```
2. If the provider uses OpenAI-compatible function calling, developer calls the existing `createOpenAICompatibleProvider(config, baseUrl)` with the provider's base URL.
3. If the provider uses a different format, developer translates:
   - Outbound: `LLMMessage[]` and `ToolDefinition[]` to the provider's request format.
   - Inbound: the provider's response to `LLMResponse` (with `content: ContentBlock[]` and `stopReason`).
4. Developer adds the new provider name to the `LLMConfig` union type in `src/config.ts` and adds a `case` to the `switch` in `createLLMProvider()`.
5. Developer sets `llm.provider` to the new name in their config and rebuilds.
6. Betsy starts using the new provider for all LLM calls.

### Alternative Flows
- **A1 (OpenAI-compatible endpoint):** For providers like Ollama or LM Studio that expose `/v1/chat/completions`, developer calls `createOpenAICompatibleProvider(config, "http://localhost:11434/v1")` with no custom translation needed.

### Postconditions
- Betsy routes all LLM calls through the new provider.
- Tool calling, memory, and the agent loop work the same way regardless of provider.

---

## UC-08-E: Enable AgentCash for Paid API Access

**Actor:** Developer
**Goal:** Allow the agent to call external paid API endpoints (web search, image generation, social data, email, etc.) billed in USDC during task work
**Preconditions:**
- AgentCash CLI is installed (`npm install -g agentcash`)
- An AgentCash wallet exists at `~/.agentcash/wallet.json` with a USDC balance

### Main Success Scenario
1. Developer sets `agentCashEnabled: true` in the Betsy config (via `cashclaw config` or by editing `~/.cashclaw/cashclaw.json`).
2. Betsy restarts and detects the flag.
3. `buildToolMap()` in `src/tools/registry.ts` includes `agentcash_fetch` and `agentcash_balance` in the active tool set.
4. The AgentCash endpoint catalog is injected into the LLM system prompt.
5. During a task, the LLM calls `agentcash_balance` to check available funds, then calls `agentcash_fetch` with a URL from the catalog.
6. The tool validates the URL against the domain allowlist, invokes the `agentcash` CLI, and returns the API response to the LLM.
7. The USDC cost is deducted from the wallet automatically.

### Alternative Flows
- **A1 (insufficient balance):** `agentcash_fetch` returns an error; the LLM proceeds without that data or asks the operator to top up the wallet.
- **A2 (blocked domain):** If the LLM constructs a URL not in the allowlist, the tool returns `"Blocked: domain not in allowlist"` and the LLM tries an alternative approach.

### Postconditions
- The agent can access 100+ external API endpoints during task work.
- Costs are tracked per call in the AgentCash wallet.
- `agentCashEnabled: false` (the default) leaves the tool set and billing unchanged.
