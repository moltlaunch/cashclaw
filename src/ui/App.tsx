import { useState, useEffect } from "react";
import { Dashboard } from "./pages/Dashboard.js";
import { Tasks } from "./pages/Tasks.js";
import { Chat } from "./pages/Chat.js";
import { Settings } from "./pages/Settings.js";
import { Setup } from "./pages/Setup.js";
import { api, type WalletInfo, type StatusData } from "./lib/api.js";

type Page = "dashboard" | "tasks" | "chat" | "settings";

const NAV: { page: Page; label: string; icon: string }[] = [
  { page: "dashboard", label: "Monitor", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
  { page: "tasks", label: "Tasks", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" },
  { page: "chat", label: "Chat", icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
  { page: "settings", label: "Settings", icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

function ClawLogo() {
  return (
    <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="30" height="30" rx="6" fill="#dc2626" />
      <path
        d="M8 19 C8 14.5, 10 9, 15 7 C12.5 11, 12.5 13.5, 13.5 16.5"
        stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      <path
        d="M15 7 C16.5 9.5, 17.5 12.5, 15.5 16.5"
        stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      <path
        d="M15 7 C19 9.5, 21 14.5, 21 19"
        stroke="white" strokeWidth="2.2" strokeLinecap="round" fill="none"
      />
      <path
        d="M10.5 18.5 C11.5 16.5, 13.5 16, 15 16.5 C16 16, 18 16.5, 19 17.5"
        stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5"
      />
    </svg>
  );
}

export function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<StatusData | null>(null);
  const [wallet, setWallet] = useState<WalletInfo | null>(null);

  useEffect(() => {
    api.getSetupStatus()
      .then((s) => setConfigured(s.configured && s.mode === "running"))
      .catch(() => setConfigured(false));
  }, []);

  useEffect(() => {
    if (!configured) return;
    function poll() {
      api.getStatus().then(setStatus).catch((err) => console.warn("Status poll failed:", err));
      api.getWallet().then(setWallet).catch(() => {});
    }
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [configured]);

  if (configured === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!configured) {
    return <Setup onComplete={() => setConfigured(true)} />;
  }

  const isRunning = status?.running ?? false;

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-[240px] shrink-0 border-r border-zinc-800/80 flex flex-col bg-[#0c0c0e] sticky top-0 h-screen">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-zinc-800/60">
          <div className="flex items-center gap-3">
            <ClawLogo />
            <div>
              <h1 className="text-[15px] font-bold text-zinc-100 leading-none tracking-tight">CashClaw</h1>
              <p className="text-[11px] text-zinc-600 leading-none mt-1">Autonomous Agent</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map((n) => (
            <button
              key={n.page}
              onClick={() => setPage(n.page)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-[13px] font-medium transition-colors ${
                page === n.page
                  ? "bg-zinc-800/80 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/40"
              }`}
            >
              {page === n.page && (
                <span className="w-[3px] h-4 rounded-full bg-red-500 -ml-1.5 mr-0.5 shrink-0" />
              )}
              <svg className="w-[17px] h-[17px] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={n.icon} />
              </svg>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Bottom: Status + Wallet */}
        <div className="px-4 py-4 border-t border-zinc-800/60 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${isRunning ? "bg-emerald-400" : "bg-zinc-600"}`} />
            <span className="text-[13px] text-zinc-400">
              {isRunning ? "Running" : "Stopped"}
            </span>
            {status?.uptime !== undefined && isRunning && (
              <span className="text-[11px] text-zinc-600 font-mono ml-auto readout">
                {formatUptime(status.uptime)}
              </span>
            )}
          </div>

          {wallet && (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-zinc-600 font-mono truncate">
                {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
              </span>
              {wallet.balance && (
                <span className="text-[11px] text-zinc-400 font-mono readout">
                  {parseFloat(wallet.balance).toFixed(4)} ETH
                </span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-zinc-800/40">
            <span className="text-[10px] text-zinc-700 font-mono">v0.1.0</span>
            <SystemClock />
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen overflow-y-auto">
        <div className="px-10 py-8">
          {page === "dashboard" && <Dashboard />}
          {page === "tasks" && <Tasks />}
          {page === "chat" && <Chat />}
          {page === "settings" && <Settings />}
        </div>
      </main>
    </div>
  );
}

function SystemClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-[10px] font-mono text-zinc-600 tabular-nums">
      {time.toLocaleTimeString([], { hour12: false })}
    </span>
  );
}

function formatUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
