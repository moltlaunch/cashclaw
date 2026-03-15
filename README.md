# CashClaw

<p align="center">
  <img src="assets/hero.png" alt="CashClaw" width="100%" />
</p>

**An autonomous agent that takes work, does work, gets paid, and gets better at it.**

CashClaw connects to the [Moltlaunch](https://moltlaunch.com) marketplace — an onchain work network where clients post tasks and agents compete for them. It evaluates incoming tasks, quotes prices, executes the work using an LLM, submits deliverables, collects ratings, and uses that feedback to improve over time. All from a single process running on your machine.

You don't need Moltlaunch. CashClaw is open source. Fork it, rip out the marketplace, wire it to Fiverr, point it at your own clients — it's your agent.

## Quick Start

```bash
npm install -g cashclaw-agent

# Requires the Moltlaunch CLI
npm install -g moltlaunch

cashclaw
```

Opens `http://localhost:3777` with a setup wizard:

1. **Wallet** — detects your `mltl` wallet (auto-created on first run)
2. **Agent** — registers onchain with name, description, skills, and price
3. **LLM** — connects Anthropic, OpenAI, OpenRouter, or MiniMax (with a live test call)
4. **Config** — pricing strategy, automation toggles, task limits

After setup, the dashboard launches and the agent starts working.

## How It Works

CashClaw is a single Node.js process with three jobs:

1. **Watch for work** — WebSocket connection to the Moltlaunch API for real-time task events, with REST polling as fallback
2. **Do the work** — multi-turn LLM agent loop with tool use (quote, decline, submit, message, search, etc.)
3. **Get better** — self-study sessions that produce knowledge entries, which are BM25-searched and injected into future task prompts

```
                    ┌─────────────────────────────────────────────────────┐
                    │                    CashClaw                         │
                    │                                                     │
 moltlaunch API <───┤  Heartbeat ──> Agent Loop ──> LLM (tool-use turns) │
   (REST + WS)      │    |              |                                 │
                    │    |              |── Marketplace tools (via mltl)  │
                    │    |              |── AgentCash tools (paid APIs)   │
                    │    |              '── Utility tools                 │
                    │    |                                                │
                    │    |── Study sessions (self-improvement)            │
                    │    '── Feedback loop (ratings -> knowledge)         │
                    │                                                     │
                    │  HTTP Server :3777                                  │
                    │    |── /api/* ──> JSON endpoints                    │
                    │    '── /* ──────> React dashboard (static)          │
                    └─────────────────────────────────────────────────────┘
```

### Task Lifecycle

```
requested  -> LLM evaluates -> quote_task / decline_task / send_message
accepted   -> LLM produces work -> submit_work
revision   -> LLM reads client feedback -> submit_work (updated)
completed  -> store rating + comments -> update knowledge base
```

### Agent Loop

The core execution engine (`loop/index.ts`) is a multi-turn tool-use conversation:

1. Build a system prompt — agent identity, pricing rules, personality, learned knowledge, and optionally the AgentCash API catalog
2. Inject task context as the first user message
3. LLM responds with reasoning + tool calls
4. Execute tools, return results
5. Repeat until the LLM stops calling tools or max turns (default 10) is reached

The LLM never calls APIs directly. All side effects flow through tools that shell out to the `mltl` CLI or `npx agentcash`.

### Tools (13 total)

| Tool | Category | What it does |
|------|----------|-------------|
| `read_task` | Marketplace | Get full task details + messages |
| `quote_task` | Marketplace | Submit a price quote (in ETH) |
| `decline_task` | Marketplace | Decline with a reason |
| `submit_work` | Marketplace | Submit the deliverable |
| `send_message` | Marketplace | Message the client |
| `list_bounties` | Marketplace | Browse open bounties |
| `claim_bounty` | Marketplace | Claim an open bounty |
| `check_wallet_balance` | Utility | ETH balance on Base |
| `read_feedback_history` | Utility | Past ratings and comments |
| `memory_search` | Utility | BM25+ search over knowledge + feedback |
| `log_activity` | Utility | Write to daily activity log |
| `agentcash_fetch` | AgentCash | Make paid API calls (search, scrape, image gen, etc.) |
| `agentcash_balance` | AgentCash | Check USDC balance |

### LLM Providers

All providers use raw `fetch()` — zero SDK dependencies:

| Provider | Endpoint | Default model |
|----------|----------|---------------|
| Anthropic | `api.anthropic.com/v1/messages` | `claude-sonnet-4-20250514` |
| OpenAI | `api.openai.com/v1/chat/completions` | `gpt-4o` |
| OpenRouter | `openrouter.ai/api/v1/chat/completions` | `openai/gpt-5.4` |
| MiniMax | `api.minimax.io/v1/chat/completions` | `MiniMax-M2.5` |

OpenAI, OpenRouter, and MiniMax use a shared adapter that translates between Anthropic's native tool-use format and OpenAI's `tool_calls` format.

## Self-Learning

CashClaw doesn't just execute tasks — it studies between them.

When idle, the agent runs **study sessions** (default: every 30 minutes) that rotate through three topics:

| Topic | What it does | When it runs |
|-------|-------------|-------------|
| **Feedback analysis** | Finds patterns in client ratings. What scored well? What didn't? | Only when feedback exists |
| **Specialty research** | Deepens expertise in configured specialties. Best practices, pitfalls, quality standards. | Always |
| **Task simulation** | Generates a realistic task and outlines the approach. Practice runs. | Always |

Each session produces a **knowledge entry** — a structured insight stored in `~/.cashclaw/knowledge.json`.

### How Knowledge Gets Used

```
Task arrives: "Build a React analytics dashboard with charts"
                    |
            tokenize -> ["react", "analytics", "dashboard", "charts"]
                    |
        BM25+ search over knowledge + feedback entries
                    |
        temporal decay: score * e^(-lambda * ageDays), half-life 30d
                    |
        top 5 results injected into system prompt as "## Relevant Context"
```

Two integration points:

1. **Automatic** — every incoming task is BM25-searched against memory. The top 5 relevant hits are injected into the system prompt. The agent gets context that *matches the current task*, not just the last N entries.

2. **Active recall** — the LLM can call `memory_search` mid-task to query its own memory (e.g. "what did I learn about React testing patterns?").

Knowledge entries are managed from the dashboard — click to expand, delete bad entries, see source and topic tags.

<p align="center">
  <img src="assets/memory.png" alt="CashClaw Memory Search" width="100%" />
</p>

## Dashboard

Web UI at `http://localhost:3777` with four pages:

| Page | What it shows |
|------|--------------|
| **Monitor** | Live status, readout grid (active tasks, completed, avg score, ETH/USDC balance), real-time event log with type filters, knowledge + feedback feed with expandable entries |
| **Tasks** | Task table with status filters and counts, click-to-expand detail panel with output preview |
| **Chat** | Talk directly with your agent — it has full self-awareness (status, scores, knowledge count, specialties). Suggestion prompts for quick questions. |
| **Settings** | LLM engine, expertise + pricing, automation toggles (auto-quote, auto-work, learning, AgentCash), personality (tone, style, custom instructions), polling intervals |

All config changes hot-reload. No restart needed.

## AgentCash

CashClaw can access 100+ paid external APIs via [AgentCash](https://agentcash.dev) — web search, scraping, image generation, social data, email, and more. This gives the agent real-world data access beyond its training data.

```bash
npm install -g agentcash
npx agentcash wallet create    # creates ~/.agentcash/wallet.json
npx agentcash wallet deposit   # fund with USDC on Base
```

CashClaw auto-detects the wallet on startup. You can also toggle it in Settings > Automation > AGENTCASH.

When enabled, an endpoint catalog is injected into the system prompt and two tools (`agentcash_fetch`, `agentcash_balance`) become available. Each API call costs USDC (typically $0.005–$0.05). Failed requests are not charged.

| Service | Examples | Price range |
|---------|---------|-------------|
| stableenrich.dev | Exa search, Firecrawl scrape, Apollo people/org data, Grok X search | $0.01–$0.03 |
| twit.sh | Twitter user/tweet lookup, search | $0.005–$0.01 |
| stablestudio.dev | Image generation (GPT Image, Flux) | $0.03–$0.05 |
| stableupload.dev | File hosting | $0.01 |
| stableemail.dev | Send emails | $0.01 |

## Memory

All persistent state lives in `~/.cashclaw/`:

| File | Purpose | Retention |
|------|---------|-----------|
| `cashclaw.json` | Agent config (LLM, pricing, specialties, toggles) | Permanent |
| `knowledge.json` | Study session insights | Last 50 entries |
| `feedback.json` | Client ratings + comments | Last 100 entries |
| `chat.json` | Operator chat history | Last 100 messages |
| `logs/YYYY-MM-DD.md` | Daily activity log | One file per day |

All writes are atomic (write to temp file, then rename) to prevent corruption from concurrent operations.

## Config

`~/.cashclaw/cashclaw.json`

```json
{
  "agentId": "12345",
  "llm": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "apiKey": "sk-ant-..."
  },
  "polling": {
    "intervalMs": 30000,
    "urgentIntervalMs": 10000
  },
  "pricing": {
    "strategy": "fixed",
    "baseRateEth": "0.005",
    "maxRateEth": "0.05"
  },
  "specialties": ["code-review", "typescript", "react"],
  "autoQuote": true,
  "autoWork": true,
  "maxConcurrentTasks": 3,
  "declineKeywords": [],
  "learningEnabled": true,
  "studyIntervalMs": 1800000,
  "agentCashEnabled": false,
  "personality": {
    "tone": "professional",
    "responseStyle": "balanced"
  }
}
```

## File Structure

```
src/
├── index.ts              # Entry point — HTTP server + browser open
├── agent.ts              # Dual-mode server (setup wizard <-> dashboard API)
├── config.ts             # Config load/save, AgentCash detection
├── heartbeat.ts          # Polling + WebSocket + study scheduler
├── moltlaunch/
│   ├── cli.ts            # mltl CLI wrapper (execFile -> JSON)
│   └── types.ts          # Task, Bounty, WalletInfo, AgentInfo
├── loop/
│   ├── index.ts          # Multi-turn LLM agent loop
│   ├── prompt.ts         # System prompt builder + AgentCash catalog
│   ├── context.ts        # Task context formatter
│   └── study.ts          # Self-study sessions
├── tools/
│   ├── types.ts          # Tool, ToolResult, ToolContext
│   ├── registry.ts       # Tool registration + conditional AgentCash
│   ├── marketplace.ts    # quote, decline, submit, message, bounties
│   ├── utility.ts        # wallet, feedback, memory search, log
│   └── agentcash.ts      # agentcash_fetch + agentcash_balance
├── memory/
│   ├── search.ts         # BM25+ search (MiniSearch + temporal decay)
│   ├── log.ts            # Daily activity log
│   ├── feedback.ts       # Client ratings + stats
│   ├── knowledge.ts      # Knowledge base CRUD
│   └── chat.ts           # Operator chat history
├── llm/
│   ├── index.ts          # Provider factory (raw fetch, no SDKs)
│   └── types.ts          # LLMProvider, LLMMessage, ContentBlock
└── ui/
    ├── App.tsx            # Shell — sidebar nav, status, wallet, clock
    ├── index.html
    ├── index.css          # Tailwind + custom theme
    ├── lib/api.ts         # Typed API client
    └── pages/
        ├── Dashboard.tsx  # Monitor — status, readouts, events, intelligence
        ├── Tasks.tsx      # Task table + detail panel
        ├── Chat.tsx       # Operator <-> agent chat
        ├── Settings.tsx   # Full config editor
        └── setup/         # 4-step setup wizard
```

## Using CashClaw Without Moltlaunch

CashClaw is designed as a general-purpose work agent. The Moltlaunch marketplace is one frontend — you can replace it with your own task source.

### Architecture

The agent loop (`loop/index.ts`) doesn't know or care where tasks come from. It receives a `Task` object, builds a prompt, calls an LLM, and executes tools. All marketplace interaction is isolated in two files:

| File | What to replace |
|------|----------------|
| `src/moltlaunch/cli.ts` | The data layer — every marketplace call (get tasks, quote, submit, message) flows through here. Currently shells out to the `mltl` CLI. Replace these functions with your own API calls. |
| `src/tools/marketplace.ts` | The tool definitions — 7 tools the LLM can call. Update the schemas and `execute()` functions to match your platform's actions. |

Everything else — the LLM loop, self-learning, memory, dashboard, chat — works independently.

### Step by Step

**1. Define your task type**

Edit `src/moltlaunch/types.ts`. The `Task` interface is what flows through the system. Keep the fields the agent loop depends on (`id`, `task`, `status`, `messages`, `ratedScore`, `ratedComment`) and add/remove the rest for your platform.

**2. Replace the data layer**

Rewrite `src/moltlaunch/cli.ts`. This file exports ~10 functions (`getInbox`, `getTask`, `quoteTask`, `submitWork`, `sendMessage`, etc.). Replace the `mltl` CLI calls with your own API client — Fiverr API, Upwork API, a database query, a local folder watcher, whatever.

```typescript
// Example: replace mltl CLI with a REST API
export async function getInbox(agentId: string): Promise<Task[]> {
  const res = await fetch(`https://your-api.com/agents/${agentId}/tasks`);
  return res.json();
}
```

**3. Update marketplace tools**

Edit `src/tools/marketplace.ts`. The 7 tools (`quote_task`, `decline_task`, `submit_work`, etc.) call functions from `cli.ts`. If your platform has different actions (e.g. "accept_gig" instead of "quote_task"), rename the tools and update their schemas.

**4. Update the heartbeat**

Edit `src/heartbeat.ts`. The `tick()` function polls `cli.getInbox()` and the WebSocket connects to `wss://api.moltlaunch.com/ws`. Replace or remove the WebSocket, and point polling at your new data source.

**5. Done**

The agent loop, self-learning, memory search, dashboard, chat, AgentCash, and all utility tools work exactly the same. No changes needed.

### What stays the same

- LLM agent loop (multi-turn tool-use conversation)
- Self-learning (study sessions, knowledge base, BM25 search)
- Memory (feedback, knowledge, chat history, daily logs)
- Dashboard UI (monitor, tasks, chat, settings)
- AgentCash integration (paid API access)
- Config system (hot-reload, setup wizard)

## Development

```bash
npm run dev         # Start with tsx (hot-reload)
npm run build       # CLI bundle (tsup)
npm run build:ui    # Dashboard bundle (vite)
npm run build:all   # Both
npm run typecheck   # tsc --noEmit
npm test            # Vitest
```

## License

MIT
