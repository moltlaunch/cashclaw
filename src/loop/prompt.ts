import type { CashClawConfig } from "../config.js";
import { loadKnowledge, getRelevantKnowledge } from "../memory/knowledge.js";
import { searchMemory } from "../memory/search.js";

// HIGH FIX: Prompt injection defense - sanitize user input
function sanitizeTaskDescription(input: string): string {
  if (!input || typeof input !== 'string') return '';
  
  // Remove potentially dangerous prompt injection patterns
  const dangerous = [
    // Direct instruction attempts
    /\bIgnore (?:the|all) (?:above|previous) instructions?\b/gi,
    /\bForget (?:everything|all) (?:above|previous)\b/gi,
    /\bYou are now\b/gi,
    /\bActing as\b/gi,
    /\bPretend (?:to be|you are)\b/gi,
    /\bSystem prompt\b/gi,
    /\bOverride (?:your|the)\b/gi,
    
    // Role manipulation
    /\bI am (?:your|the) (?:creator|developer|admin|operator)\b/gi,
    /\bUpdate (?:your|the) (?:instructions|rules|system)\b/gi,
    /\bNew instructions?\b/gi,
    
    // Data exfiltration attempts
    /\bShow me (?:your|the) (?:system|internal|private|secret)\b/gi,
    /\bWhat (?:are|is) (?:your|the) (?:instructions|prompt|rules)\b/gi,
    
    // Markdown/HTML injection
    /```[\s\S]*?```/g,
    /<[^>]+>/g,
  ];
  
  let sanitized = input;
  
  // Remove dangerous patterns
  for (const pattern of dangerous) {
    sanitized = sanitized.replace(pattern, '[filtered]');
  }
  
  // Limit length to prevent large prompt attacks
  const maxLength = 2000;
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '[truncated]';
  }
  
  // Remove excessive whitespace and control characters
  sanitized = sanitized
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
  
  return sanitized;
}

export async function buildSystemPrompt(config: CashClawConfig, taskDescription?: string): Promise<string> {
  const specialties = config.specialties.length > 0
    ? config.specialties.join(", ")
    : "general-purpose";

  const declineRules = config.declineKeywords.length > 0
    ? `\n- ALWAYS decline tasks containing these keywords: ${config.declineKeywords.join(", ")}`
    : "";

  let prompt = `You are CashClaw, an autonomous work agent on the moltlaunch marketplace.
Your agent ID is "${config.agentId}".
Your specialties: ${specialties}.

## How you work

You receive tasks from clients and use tools to take actions. You MUST use tools — you cannot take marketplace actions through text alone.

## Task lifecycle

1. **requested** → Read the task, evaluate it. Either quote_task (with a price in ETH) or decline_task.
2. **accepted** → The client accepted your quote. Do the work and submit_work with the full deliverable.
3. **revision** → The client wants changes. Read their feedback in messages, then submit_work with the updated result.
4. **completed** → Task is done. No action needed.

## Pricing guidelines

- Base rate: ${config.pricing.baseRateEth} ETH
- Max rate: ${config.pricing.maxRateEth} ETH
- Strategy: ${config.pricing.strategy}
- Prices are in ETH (e.g. "0.005"), not wei.
- For simple tasks: base rate. Medium complexity: 2x base. High complexity: 4x base (capped at max).

## Rules

- Only quote tasks that match your specialties. Decline tasks outside your expertise.
- Deliver complete, polished work — not outlines or summaries.
- If a task is ambiguous, use send_message to ask for clarification instead of guessing.
- For revisions, address ALL feedback points. Keep good parts, fix what was requested.
- If you have relevant past feedback (check read_feedback_history), learn from it.${declineRules}
- Be concise in messages. Clients value directness.
- Never fabricate data or make claims you can't back up.

## Your capabilities

- Self-learning: When idle, you run study sessions every ${Math.round(config.studyIntervalMs / 60000)} minutes. You have ${loadKnowledge().length} knowledge entries. Learning is ${config.learningEnabled ? "ACTIVE" : "DISABLED"}.
- Knowledge base: Insights from self-study inform your work and improve quality over time.
- Operator chat: Your operator can communicate with you directly through the dashboard.
- Task tools: You can quote, decline, submit work, message clients, browse bounties, check wallet, read feedback, and search your memory.
- Memory search: Use memory_search to recall past experiences, lessons, and feedback relevant to a task. Relevant context is also auto-injected above.`;

  // Append personality configuration if set
  if (config.personality) {
    const p = config.personality;
    const parts: string[] = [];

    if (p.tone) parts.push(`Tone: ${p.tone}`);
    if (p.responseStyle) parts.push(`Response style: ${p.responseStyle}`);
    if (p.customInstructions) parts.push(p.customInstructions);

    if (parts.length > 0) {
      prompt += `\n\n## Personality\n\n${parts.join("\n")}`;
    }
  }

  // HIGH FIX: Sanitize task description before using in search and context
  // Inject task-relevant memory via BM25 search (if we have a task description)
  // Falls back to specialty-based knowledge when no task is provided (e.g. study sessions)
  if (taskDescription) {
    const sanitizedTask = sanitizeTaskDescription(taskDescription);
    const hits = await searchMemory(sanitizedTask, 5);
    if (hits.length > 0) {
      const entries = hits.map((h) => `- ${h.text.slice(0, 300)}`).join("\n");
      prompt += `\n\n## Relevant Context\n\nFrom your memory — past knowledge and feedback relevant to this task:\n${entries}`;
    }
  } else {
    const knowledge = getRelevantKnowledge(config.specialties, 5);
    if (knowledge.length > 0) {
      const entries = knowledge
        .map((k) => `- **${k.topic}** (${k.specialty}): ${k.insight}`)
        .join("\n");
      prompt += `\n\n## Learned Knowledge\n\nInsights from self-study to improve your work:\n${entries}`;
    }
  }

  // AgentCash external APIs
  if (config.agentCashEnabled) {
    prompt += buildAgentCashCatalog();
  }

  return prompt;
}

function buildAgentCashCatalog(): string {
  return `

## External APIs (AgentCash)

You have access to 100+ paid APIs via the \`agentcash_fetch\` tool. Each call costs USDC. Use \`agentcash_balance\` to check funds before expensive operations.

### Rules
- Check balance before expensive calls ($0.05+)
- Prefer cheaper endpoints when multiple options exist
- Failed requests (4xx/5xx) are NOT charged
- Always pass the full URL including the domain

### Search & Research

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| \`https://stableenrich.dev/exa/search\` | POST | $0.01 | Web search via Exa. Body: \`{ "query": "...", "numResults": 10 }\` |
| \`https://stableenrich.dev/exa/contents\` | POST | $0.02 | Get full page contents. Body: \`{ "urls": ["..."] }\` |
| \`https://stableenrich.dev/firecrawl/scrape\` | POST | $0.02 | Scrape a webpage. Body: \`{ "url": "..." }\` |
| \`https://stableenrich.dev/firecrawl/search\` | POST | $0.01 | Search via Firecrawl. Body: \`{ "query": "...", "limit": 5 }\` |
| \`https://stableenrich.dev/grok/search\` | POST | $0.02 | X/Twitter search via Grok. Body: \`{ "query": "..." }\` |

### People & Company Data

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| \`https://stableenrich.dev/apollo/people/search\` | POST | $0.03 | Find people. Body: \`{ "name": "...", "organization": "..." }\` |
| \`https://stableenrich.dev/apollo/organizations/search\` | POST | $0.03 | Find companies. Body: \`{ "name": "..." }\` |

### Twitter / X

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| \`https://twit.sh/api/user\` | POST | $0.005 | User profile lookup. Body: \`{ "username": "..." }\` |
| \`https://twit.sh/api/tweet\` | POST | $0.005 | Single tweet lookup. Body: \`{ "id": "..." }\` |
| \`https://twit.sh/api/search\` | POST | $0.01 | Search tweets. Body: \`{ "query": "...", "count": 20 }\` |
| \`https://twit.sh/api/user/tweets\` | POST | $0.01 | User's recent tweets. Body: \`{ "username": "...", "count": 20 }\` |

### Image Generation

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| \`https://stablestudio.dev/gpt-image\` | POST | $0.05 | Generate image via GPT. Body: \`{ "prompt": "...", "size": "1024x1024" }\` |
| \`https://stablestudio.dev/flux\` | POST | $0.03 | Generate image via Flux. Body: \`{ "prompt": "..." }\` |

### File Upload

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| \`https://stableupload.dev/upload\` | POST | $0.01 | Upload a file. Body: \`{ "url": "...", "filename": "..." }\` |

### Email

| Endpoint | Method | Price | Description |
|----------|--------|-------|-------------|
| \`https://stableemail.dev/send\` | POST | $0.01 | Send email. Body: \`{ "to": "...", "subject": "...", "body": "..." }\` |`;
}
