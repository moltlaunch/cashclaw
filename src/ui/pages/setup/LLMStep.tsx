import { useState } from "react";
import { api } from "../../lib/api.js";

interface LLMStepProps {
  onNext: () => void;
}

const PROVIDERS = [
  { value: "anthropic", label: "ANTHROPIC", desc: "Claude models", model: "claude-sonnet-4-20250514" },
  { value: "openai", label: "OPENAI", desc: "GPT-4o", model: "gpt-4o" },
  { value: "openrouter", label: "OPENROUTER", desc: "Multi-provider", model: "openai/gpt-5.4" },
  { value: "minimax", label: "MINIMAX", desc: "MiniMax M2.7", model: "MiniMax-M2.7" },
];

export function LLMStep({ onNext }: LLMStepProps) {
  const [provider, setProvider] = useState("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(PROVIDERS[0].model);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testPassed, setTestPassed] = useState(false);
  const [error, setError] = useState("");

  function handleProviderChange(p: string) {
    setProvider(p);
    const prov = PROVIDERS.find((pr) => pr.value === p);
    setModel(prov?.model ?? "");
    setTestPassed(false);
    setTestResult(null);
  }

  async function handleTest() {
    if (!apiKey.trim()) return;
    setTesting(true);
    setError("");
    setTestResult(null);
    try {
      const result = await api.testLLM({ provider, model, apiKey });
      setTestResult(result.response);
      setTestPassed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Connection test failed");
      setTestPassed(false);
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await api.saveLLM({ provider, model, apiKey });
      onNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full bg-zinc-950 border border-red-500/10 rounded-sm px-3 py-2 text-[11px] font-mono text-zinc-400 focus:outline-none focus:border-red-500/25 transition-colors";

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-mono font-bold text-zinc-200 mb-1">Brain</h2>
        <p className="text-[11px] text-zinc-600 font-mono leading-relaxed">
          Connect the LLM powering reasoning and execution.
        </p>
      </div>

      {error && (
        <div className="panel px-4 py-3 text-[11px] text-red-400 font-mono">{error}</div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1.5">PROVIDER</label>
          <div className="space-y-1">
            {PROVIDERS.map((p) => (
              <button
                key={p.value}
                onClick={() => handleProviderChange(p.value)}
                className={`w-full text-left px-3 py-2.5 rounded-sm border transition-all duration-100 ${
                  provider === p.value
                    ? "border-red-500/25 bg-red-500/5"
                    : "border-zinc-800 hover:border-zinc-700"
                }`}
              >
                <span className={`block text-[11px] font-mono font-bold tracking-wider ${provider === p.value ? "text-zinc-300" : "text-zinc-500"}`}>
                  {p.label}
                </span>
                <span className="block text-[9px] text-zinc-700 mt-0.5 font-mono">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">API KEY</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setTestPassed(false); }}
            placeholder="sk-..."
            className={inputCls}
          />
        </div>

        <div>
          <label className="block text-[8px] text-zinc-700 font-mono font-bold tracking-[0.2em] mb-1">MODEL</label>
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} />
        </div>
      </div>

      <button
        onClick={handleTest}
        disabled={testing || !apiKey.trim()}
        className="w-full py-2 border border-zinc-800 rounded-sm text-[10px] text-zinc-500 hover:bg-zinc-900/50 disabled:opacity-40 font-mono tracking-wider transition-colors"
      >
        {testing ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 border border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            TESTING...
          </span>
        ) : (
          "TEST CONNECTION"
        )}
      </button>

      {testResult && (
        <div className="panel border-green-500/15 px-4 py-3">
          <p className="text-[8px] text-green-500 font-mono font-bold tracking-[0.2em] mb-1">LINK ESTABLISHED</p>
          <p className="text-zinc-500 text-[10px] italic font-mono">"{testResult.slice(0, 120)}"</p>
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !testPassed}
        className="w-full py-2.5 bg-zinc-100 text-zinc-900 rounded-sm text-[11px] font-mono font-bold tracking-wider hover:bg-white disabled:opacity-40 transition-colors"
      >
        {saving ? "SAVING..." : "CONFIGURE DEPLOY"}
      </button>
    </div>
  );
}
