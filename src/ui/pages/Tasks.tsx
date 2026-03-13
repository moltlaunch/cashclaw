import { useState, useEffect } from "react";
import { api, type TaskData } from "../lib/api.js";
import { formatEther } from "viem";

const STATUS_COLORS: Record<string, string> = {
  requested: "bg-amber-400",
  quoted: "bg-blue-400",
  accepted: "bg-emerald-400",
  submitted: "bg-violet-400",
  revision: "bg-orange-400",
  completed: "bg-emerald-400",
  declined: "bg-zinc-600",
  cancelled: "bg-zinc-600",
};

const STATUSES = ["all", "requested", "quoted", "accepted", "submitted", "completed", "declined"] as const;

export function Tasks() {
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [selected, setSelected] = useState<TaskData | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const data = await api.getTasks();
        if (active) {
          setTasks(data.tasks);
          setError(null);
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to load tasks");
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), 5000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const filtered = statusFilter === "all"
    ? tasks
    : tasks.filter((t) => t.status === statusFilter);

  const statusCounts = tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight mb-1.5">Tasks</h1>
          <p className="text-sm text-zinc-500 font-mono">{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {error && tasks.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-sm text-red-400 mb-1">Connection error</p>
          <p className="text-xs text-zinc-600 font-mono">{error}</p>
        </div>
      )}

      {/* Status filter tabs */}
      {tasks.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {STATUSES.map((s) => {
            const count = s === "all" ? tasks.length : (statusCounts[s] ?? 0);
            if (s !== "all" && count === 0) return null;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(statusFilter === s ? "all" : s)}
                className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-zinc-700 text-zinc-200"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60"
                }`}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="text-zinc-600 ml-1.5 font-mono text-[11px]">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card text-center py-24">
          <p className="text-zinc-400 text-base mb-1.5">
            {tasks.length === 0 ? "No active tasks" : "No matching tasks"}
          </p>
          <p className="text-zinc-600 text-sm">
            {tasks.length === 0 ? "Tasks will appear here when dispatched" : "Try a different filter"}
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800/60">
                {["ID", "Task", "Status", "Value", "Score"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-4 py-3 text-[11px] text-zinc-500 font-semibold uppercase tracking-wider ${
                      i >= 3 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/30">
              {filtered.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setSelected(selected?.id === t.id ? null : t)}
                  className={`cursor-pointer transition-colors ${
                    selected?.id === t.id ? "bg-zinc-800/35" : "hover:bg-zinc-800/20"
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <code className="text-zinc-500 text-[13px] font-mono">{t.id.slice(0, 8)}</code>
                  </td>
                  <td className="px-4 py-3.5 max-w-lg">
                    <p className="text-[13px] text-zinc-300 truncate">{t.task}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-[13px] text-zinc-400">
                      <span className={`w-1.5 h-1.5 rounded-sm shrink-0 ${STATUS_COLORS[t.status] ?? "bg-zinc-600"}`} />
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-[13px] font-mono text-zinc-500 readout">
                    {t.quotedPriceWei ? `${formatEther(BigInt(t.quotedPriceWei))} ETH` : "--"}
                  </td>
                  <td className="px-4 py-3.5 text-right text-[13px] font-mono text-zinc-500">
                    {t.ratedScore !== undefined ? `${t.ratedScore}/5` : "--"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="card p-5 space-y-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-sm ${STATUS_COLORS[selected.status] ?? "bg-zinc-600"}`} />
              <h3 className="text-sm font-semibold text-zinc-300">
                Task <span className="text-zinc-200 font-mono">{selected.id.slice(0, 12)}</span>
              </h3>
              <span className="text-[12px] text-zinc-500 font-mono uppercase">{selected.status}</span>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="text-[12px] text-zinc-600 hover:text-zinc-300 transition-colors font-medium"
            >
              Close
            </button>
          </div>

          <p className="text-sm text-zinc-300 leading-relaxed">{selected.task}</p>

          <div className="flex gap-6 pt-1">
            {selected.quotedPriceWei && (
              <div>
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">Value</p>
                <p className="text-sm font-mono text-zinc-300">{formatEther(BigInt(selected.quotedPriceWei))} ETH</p>
              </div>
            )}
            {selected.ratedScore !== undefined && (
              <div>
                <p className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mb-0.5">Score</p>
                <p className="text-sm font-mono text-zinc-300">{selected.ratedScore}/5</p>
              </div>
            )}
          </div>

          {selected.result && (
            <div className="pt-1">
              <p className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider mb-2">Output</p>
              <pre className="text-[13px] text-zinc-400 bg-zinc-950 p-4 rounded-md overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap border border-zinc-800/60 font-mono leading-relaxed">
                {selected.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
