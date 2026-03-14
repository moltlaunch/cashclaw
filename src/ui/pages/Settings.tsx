import { useState, useEffect } from "react";
import { api, type ConfigData, type AgentInfo, type PersonalityData } from "../lib/api.js";
import { ethToUsd, usdToEth } from "../lib/ethPrice.js";

interface FormState {
  specialties: string;
  declineKeywords: string;
  strategy: string;
  baseRate: string;
  maxRate: string;
  maxTasks: number;
  autoQuote: boolean;
  autoWork: boolean;
  learningEnabled: boolean;
  agentCashEnabled: boolean;
  tone: PersonalityData["tone"];
  responseStyle: PersonalityData["responseStyle"];
  customInstructions: string;
  studyIntervalMin: number;
  pollIntervalSec: number;
  urgentPollIntervalSec: number;
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
}

function configToForm(c: ConfigData): FormState {
  return {
    specialties: c.specialties.join(", "),
    declineKeywords: c.declineKeywords.join(", "),
    strategy: c.pricing.strategy,
    baseRate: c.pricing.baseRateEth,
    maxRate: c.pricing.maxRateEth,
    maxTasks: c.maxConcurrentTasks,
    autoQuote: c.autoQuote,
    autoWork: c.autoWork,
    learningEnabled: c.learningEnabled,
    agentCashEnabled: c.agentCashEnabled ?? false,
    tone: c.personality?.tone ?? "professional",
    responseStyle: c.personality?.responseStyle ?? "concise",
    customInstructions: c.personality?.customInstructions ?? "",
    studyIntervalMin: Math.round(c.studyIntervalMs / 60000),
    pollIntervalSec: Math.round(c.polling.intervalMs / 1000),
    urgentPollIntervalSec: Math.round(c.polling.urgentIntervalMs / 1000),
    llmProvider: c.llm.provider,
    llmModel: c.llm.model,
    llmApiKey: c.llm.apiKey,
  };
}

export function Settings() {
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [agentInfo, setAgentInfo] = useState<AgentInfo | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [llmTesting, setLlmTesting] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ethPrice, setEthPrice] = useState<number>(0);

  useEffect(() => {
    api.getConfig().then((c) => {
      setConfig(c);
      // Convert ETH → USD for display once we have the price
      api.getEthPrice().then(({ price }) => {
        setEthPrice(price);
        setForm({
          ...configToForm(c),
          baseRate: ethToUsd(c.pricing.baseRateEth, price),
          maxRate: ethToUsd(c.pricing.maxRateEth, price),
        });
      }).catch(() => {
        // Fallback: show raw ETH values if price fetch fails
        setForm(configToForm(c));
      });
    }).catch((err) => setLoadError(err instanceof Error ? err.message : "Failed to load config"));
    api.getAgentInfo().then((r) => setAgentInfo(r.agent)).catch(() => {});
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  }

  async function save() {
    if (!form || !config) return;
    setSaving(true);
    setMessage("");
    try {
      const hasRealKey = form.llmApiKey !== "***" && form.llmApiKey.trim() !== "";
      const llmChanged =
        form.llmProvider !== config.llm.provider ||
        form.llmModel !== config.llm.model ||
        (hasRealKey && form.llmApiKey !== config.llm.apiKey);

      // Build LLM update: use masked key to keep existing, only send new key if changed
      const llmUpdate = llmChanged
        ? { llm: { provider: form.llmProvider, model: form.llmModel, apiKey: hasRealKey ? form.llmApiKey : "***" } }
        : {};

      // Convert USD inputs → ETH for storage
      const baseEth = ethPrice > 0 ? usdToEth(parseFloat(form.baseRate) || 0, ethPrice) : form.baseRate;
      const maxEth = ethPrice > 0 ? usdToEth(parseFloat(form.maxRate) || 0, ethPrice) : form.maxRate;

      await api.updateConfig({
        specialties: form.specialties.split(",").map((s) => s.trim()).filter(Boolean),
        declineKeywords: form.declineKeywords.split(",").map((s) => s.trim()).filter(Boolean),
        pricing: { strategy: form.strategy, baseRateEth: baseEth, maxRateEth: maxEth },
        autoQuote: form.autoQuote,
        autoWork: form.autoWork,
        maxConcurrentTasks: form.maxTasks,
        learningEnabled: form.learningEnabled,
        agentCashEnabled: form.agentCashEnabled,
        personality: {
          tone: form.tone,
          responseStyle: form.responseStyle,
          customInstructions: form.customInstructions || undefined,
        },
        studyIntervalMs: form.studyIntervalMin * 60000,
        polling: {
          intervalMs: form.pollIntervalSec * 1000,
          urgentIntervalMs: form.urgentPollIntervalSec * 1000,
        },
        ...llmUpdate,
      });
      setMessage("SAVED");
      setTimeout(() => setMessage(""), 2000);
      const fresh = await api.getConfig();
      setConfig(fresh);
    } catch (err) {
      setMessage(err instanceof Error ? `FAILED: ${err.message}` : "FAILED");
    } finally {
      setSaving(false);
    }
  }

  async function testLlm() {
    if (!form) return;
    setLlmTesting(true);
    setLlmTestResult("");
    try {
      const result = await api.testLLM({
        provider: form.llmProvider,
        model: form.llmModel,
        apiKey: form.llmApiKey === "***" ? config?.llm.apiKey ?? "" : form.llmApiKey,
      });
      setLlmTestResult(result.response);
    } catch (err) {
      setLlmTestResult(err instanceof Error ? err.message : "Test failed");
    } finally {
      setLlmTesting(false);
    }
  }

  if (loadError) {
    return (
      <div className="text-center py-32">
        <p className="text-sm text-red-400 mb-2">Failed to load settings</p>
        <p className="text-xs text-zinc-600 font-mono">{loadError}</p>
      </div>
    );
  }

  if (!config || !form) {
    return (
      <div className="text-center py-32">
        <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-zinc-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-bold text-zinc-100 tracking-tight mb-1.5">Settings</h1>
        <p className="text-sm text-zinc-500">Configure your autonomous agent</p>
      </div>

      {/* Agent Identity */}
      <Section title="Agent Identity">
        <div className="flex items-start justify-between gap-6">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-lg bg-zinc-800 border border-zinc-700/50 flex items-center justify-center shrink-0">
              <span className="text-zinc-300 text-xl font-bold">
                {(agentInfo?.name ?? config.agentId)?.[0]?.toUpperCase() ?? "?"}
              </span>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-zinc-200 truncate tracking-tight">
                {agentInfo?.name ?? config.agentId}
              </h2>
              {agentInfo?.description && (
                <p className="text-[13px] text-zinc-500 truncate">{agentInfo.description}</p>
              )}
              <p className="text-[11px] text-zinc-600 font-mono mt-0.5">{config.agentId.slice(0, 20)}...</p>
            </div>
          </div>
          <div className="flex gap-5 shrink-0">
            {agentInfo?.reputation !== undefined && (
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">Rep</p>
                <p className="text-lg font-bold text-zinc-200 font-mono readout">{agentInfo.reputation}</p>
              </div>
            )}
            {agentInfo?.skills && (
              <div className="text-right">
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">Skills</p>
                <p className="text-lg font-bold text-zinc-200 font-mono readout">{agentInfo.skills.length}</p>
              </div>
            )}
          </div>
        </div>
        {agentInfo?.skills && agentInfo.skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-4 pt-3 border-t border-zinc-800/50">
            {agentInfo.skills.map((s) => (
              <span key={s} className="px-2.5 py-1 rounded-md text-[11px] font-medium text-zinc-400 bg-zinc-800/70 border border-zinc-700/30">{s}</span>
            ))}
          </div>
        )}
        {agentInfo?.flaunchToken && (
          <div className="mt-4 pt-3 border-t border-zinc-800/50 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">Token</p>
              <p className="text-[12px] text-zinc-400 font-mono">{agentInfo.flaunchToken.slice(0, 10)}...{agentInfo.flaunchToken.slice(-6)}</p>
            </div>
            <a
              href={`https://flaunch.gg/base/coin/${agentInfo.flaunchToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-md text-[11px] font-medium text-zinc-400 bg-zinc-800/70 border border-zinc-700/30 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
            >
              View on Flaunch
            </a>
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left */}
        <div className="space-y-5">
          <Section title="LLM Engine">
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Provider">
                  <select value={form.llmProvider} onChange={(e) => update("llmProvider", e.target.value)} className={inputClass}>
                    <option value="anthropic">Anthropic</option>
                    <option value="openai">OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="ollama">Ollama (Local)</option>
                  </select>
                </Field>
                <Field label="Model">
                  <input type="text" value={form.llmModel} onChange={(e) => update("llmModel", e.target.value)} placeholder="claude-sonnet-4-20250514" className={inputClass} />
                </Field>
              </div>
              <Field label="API Key">
                <input type="password" value={form.llmApiKey} onChange={(e) => update("llmApiKey", e.target.value)} className={inputClass} />
              </Field>
              <div className="flex items-center gap-3">
                <button onClick={() => void testLlm()} disabled={llmTesting} className="px-3.5 py-2 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-30 text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50">
                  {llmTesting ? "Testing..." : "Test Connection"}
                </button>
                {llmTestResult && <span className="text-[11px] text-zinc-500 truncate flex-1 font-mono">{llmTestResult.slice(0, 80)}</span>}
              </div>
            </div>
          </Section>

          <Section title="Expertise">
            <div className="space-y-3.5">
              <Field label="Specialties" hint="comma-separated">
                <input type="text" value={form.specialties} onChange={(e) => update("specialties", e.target.value)} placeholder="typescript, react, solidity" className={inputClass} />
              </Field>
              <Field label="Decline Keywords" hint="auto-reject matching tasks">
                <input type="text" value={form.declineKeywords} onChange={(e) => update("declineKeywords", e.target.value)} placeholder="nsfw, illegal, gambling" className={inputClass} />
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Strategy">
                  <select value={form.strategy} onChange={(e) => update("strategy", e.target.value)} className={inputClass}>
                    <option value="fixed">Fixed</option>
                    <option value="complexity">Complexity</option>
                  </select>
                </Field>
                <Field label="Base Rate">
                  <input type="text" value={form.baseRate} onChange={(e) => update("baseRate", e.target.value)} placeholder="10.00" className={inputClass} />
                  {ethPrice > 0 && (
                    <p className="text-[10px] text-zinc-600 mt-1 font-mono">
                      ≈ {usdToEth(parseFloat(form.baseRate) || 0, ethPrice)} ETH
                    </p>
                  )}
                </Field>
                <Field label="Max Rate">
                  <input type="text" value={form.maxRate} onChange={(e) => update("maxRate", e.target.value)} placeholder="100.00" className={inputClass} />
                  {ethPrice > 0 && (
                    <p className="text-[10px] text-zinc-600 mt-1 font-mono">
                      ≈ {usdToEth(parseFloat(form.maxRate) || 0, ethPrice)} ETH
                    </p>
                  )}
                </Field>
              </div>
              <Field label="Max Concurrent Tasks">
                <input type="number" min={1} max={10} value={form.maxTasks} onChange={(e) => update("maxTasks", Number(e.target.value))} className={inputClass} />
              </Field>
            </div>
          </Section>
        </div>

        {/* Right */}
        <div className="space-y-5">
          <Section title="Automation">
            <div className="space-y-1">
              <Toggle label="Auto Quote" description="Quote incoming tasks automatically" checked={form.autoQuote} onChange={(v) => update("autoQuote", v)} />
              <Toggle label="Auto Work" description="Start work on accepted tasks" checked={form.autoWork} onChange={(v) => update("autoWork", v)} />
              <Toggle label="Learning" description="Run study sessions when idle" checked={form.learningEnabled} onChange={(v) => update("learningEnabled", v)} />
              <Toggle label="AgentCash" description="Enable paid API access" checked={form.agentCashEnabled} onChange={(v) => update("agentCashEnabled", v)} />
            </div>
          </Section>

          <Section title="Personality">
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tone">
                  <select value={form.tone} onChange={(e) => update("tone", e.target.value as PersonalityData["tone"])} className={inputClass}>
                    <option value="professional">Professional</option>
                    <option value="casual">Casual</option>
                    <option value="friendly">Friendly</option>
                    <option value="technical">Technical</option>
                  </select>
                </Field>
                <Field label="Response Style">
                  <select value={form.responseStyle} onChange={(e) => update("responseStyle", e.target.value as PersonalityData["responseStyle"])} className={inputClass}>
                    <option value="concise">Concise</option>
                    <option value="detailed">Detailed</option>
                    <option value="balanced">Balanced</option>
                  </select>
                </Field>
              </div>
              <Field label="Custom Instructions" hint="optional">
                <textarea value={form.customInstructions} onChange={(e) => update("customInstructions", e.target.value)} placeholder="Additional guidance for the agent..." rows={3} className={`${inputClass} resize-none`} />
              </Field>
            </div>
          </Section>

          <Section title="Timing">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Study Interval">
                <div className="flex items-center gap-1.5">
                  <input type="number" min={1} max={1440} value={form.studyIntervalMin} onChange={(e) => update("studyIntervalMin", Number(e.target.value))} className={inputClass} />
                  <span className="text-[11px] text-zinc-600 shrink-0 font-mono">min</span>
                </div>
              </Field>
              <Field label="Poll Interval">
                <div className="flex items-center gap-1.5">
                  <input type="number" min={5} max={600} value={form.pollIntervalSec} onChange={(e) => update("pollIntervalSec", Number(e.target.value))} className={inputClass} />
                  <span className="text-[11px] text-zinc-600 shrink-0 font-mono">sec</span>
                </div>
              </Field>
              <Field label="Urgent Poll">
                <div className="flex items-center gap-1.5">
                  <input type="number" min={3} max={120} value={form.urgentPollIntervalSec} onChange={(e) => update("urgentPollIntervalSec", Number(e.target.value))} className={inputClass} />
                  <span className="text-[11px] text-zinc-600 shrink-0 font-mono">sec</span>
                </div>
              </Field>
            </div>
          </Section>

        </div>
      </div>

      {/* Save Bar */}
      <div className="fixed bottom-0 left-[240px] right-0 z-20 border-t border-zinc-800/80 bg-[#09090b]/95 backdrop-blur-sm">
        <div className="px-10 py-3 flex items-center justify-end gap-4">
          {message && (
            <span className={`text-[12px] font-semibold font-mono uppercase tracking-wider ${message === "SAVED" ? "text-emerald-400" : "text-red-400"}`}>
              {message}
            </span>
          )}
          <button
            onClick={() => void save()}
            disabled={saving}
            className="px-5 py-2 rounded-md text-[13px] font-semibold transition-colors disabled:opacity-30 text-white bg-red-600 hover:bg-red-500"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass = "w-full bg-zinc-900/80 border border-zinc-800/80 rounded-md px-3 py-2 text-[13px] text-zinc-300 focus:outline-none focus:border-zinc-600 transition-colors";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="w-full flex items-center justify-between py-2.5 px-1 group"
    >
      <div className="text-left">
        <p className="text-[13px] font-medium text-zinc-300">{label}</p>
        <p className="text-[11px] text-zinc-600 mt-0.5">{description}</p>
      </div>
      <div className={`w-8 h-[18px] rounded-full transition-colors shrink-0 relative ${checked ? "bg-emerald-500" : "bg-zinc-700"}`}>
        <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white transition-transform ${checked ? "left-[16px]" : "left-[2px]"}`} />
      </div>
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider block mb-1.5">
        {label}
        {hint && <span className="text-zinc-600 font-normal lowercase tracking-normal ml-1">({hint})</span>}
      </label>
      {children}
    </div>
  );
}
