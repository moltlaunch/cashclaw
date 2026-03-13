const BASE = "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(body.error ?? `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText })) as { error?: string };
    throw new Error(data.error ?? `API ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// --- Dashboard types ---

export interface StatusData {
  running: boolean;
  activeTasks: number;
  totalPolls: number;
  lastPoll: number;
  startedAt: number;
  uptime: number;
  agentId: string;
}

export interface ActivityEvent {
  timestamp: number;
  type: string;
  taskId?: string;
  message: string;
}

export interface TaskData {
  id: string;
  task: string;
  status: string;
  quotedPriceWei?: string;
  ratedScore?: number;
  result?: string;
}

export interface StatsData {
  totalTasks: number;
  avgScore: number;
  completionRate: number;
  studySessions: number;
  knowledgeEntries: number;
}

export interface KnowledgeEntry {
  id: string;
  topic: string;
  specialty: string;
  insight: string;
  source: string;
  timestamp: number;
}

export interface FeedbackEntry {
  taskId: string;
  taskDescription: string;
  score: number;
  comments: string;
  timestamp: number;
}

export interface PersonalityData {
  tone: "professional" | "casual" | "friendly" | "technical";
  responseStyle: "concise" | "detailed" | "balanced";
  customInstructions?: string;
}

export interface PollingData {
  intervalMs: number;
  urgentIntervalMs: number;
}

export interface ConfigData {
  agentId: string;
  llm: { provider: string; model: string; apiKey: string };
  specialties: string[];
  pricing: { strategy: string; baseRateEth: string; maxRateEth: string };
  autoQuote: boolean;
  autoWork: boolean;
  maxConcurrentTasks: number;
  declineKeywords: string[];
  learningEnabled: boolean;
  studyIntervalMs: number;
  personality?: PersonalityData;
  polling: PollingData;
  agentCashEnabled: boolean;
}

export interface AgentCashBalance {
  address: string;
  balance: string;
  network: string;
}

// --- Setup types ---

export interface SetupStatus {
  configured: boolean;
  mode: "setup" | "running";
  step: string;
}

export interface WalletInfo {
  address: string;
  balance?: string;
}

export interface RegisterResult {
  agentId: string;
  txHash?: string;
}

export interface AgentInfo {
  agentId: string;
  name: string;
  description: string;
  skills: string[];
  priceEth: string;
  owner: string;
  flaunchToken?: string;
  reputation?: number;
}

export interface LLMTestResult {
  ok: boolean;
  response: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// --- API ---

export const api = {
  // Dashboard
  getStatus: () => get<StatusData>("/api/status"),
  getTasks: () => get<{ tasks: TaskData[]; events: ActivityEvent[] }>("/api/tasks"),
  getLogs: () => get<{ log: string }>("/api/logs"),
  getConfig: () => get<ConfigData>("/api/config"),
  getStats: () => get<StatsData>("/api/stats"),
  getKnowledge: () => get<{ entries: KnowledgeEntry[] }>("/api/knowledge"),
  deleteKnowledge: (id: string) => post<{ ok: boolean }>("/api/knowledge/delete", { id }),
  getFeedback: () => get<{ entries: FeedbackEntry[] }>("/api/feedback"),
  stop: () => post<{ ok: boolean }>("/api/stop"),
  start: () => post<{ ok: boolean }>("/api/start"),
  updateConfig: (updates: Partial<ConfigData>) =>
    post<{ ok: boolean }>("/api/config-update", updates),
  getChat: () => get<{ messages: ChatMessage[] }>("/api/chat"),
  sendChat: (message: string) => post<{ reply: string }>("/api/chat", { message }),
  clearChat: () => post<{ ok: boolean }>("/api/chat/clear"),
  getAgentInfo: () => get<{ agent: AgentInfo | null }>("/api/agent-info"),
  getAgentCashBalance: () => get<AgentCashBalance>("/api/agentcash-balance"),

  // Setup
  getSetupStatus: () => get<SetupStatus>("/api/setup/status"),
  getWallet: () => get<WalletInfo>("/api/setup/wallet"),
  importWallet: (privateKey: string) =>
    post<WalletInfo>("/api/setup/wallet/import", { privateKey }),
  lookupAgent: () => get<{ agent: AgentInfo | null }>("/api/setup/agent-lookup"),
  registerAgent: (opts: {
    name: string;
    description: string;
    skills: string[];
    price: string;
    symbol?: string;
    token?: string;
  }) => post<RegisterResult>("/api/setup/register", opts),
  saveLLM: (llm: { provider: string; model: string; apiKey: string }) =>
    post<{ ok: boolean }>("/api/setup/llm", llm),
  testLLM: (llm: { provider: string; model: string; apiKey: string }) =>
    post<LLMTestResult>("/api/setup/llm/test", llm),
  saveSpecialization: (spec: {
    specialties: string[];
    pricing: { strategy: string; baseRateEth: string; maxRateEth: string };
    autoQuote: boolean;
    autoWork: boolean;
    maxConcurrentTasks: number;
    declineKeywords: string[];
  }) => post<{ ok: boolean }>("/api/setup/specialization", spec),
  completeSetup: () => post<{ ok: boolean; mode: string }>("/api/setup/complete"),
};
