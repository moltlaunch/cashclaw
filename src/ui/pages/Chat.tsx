import { useState, useEffect, useRef, useMemo } from "react";
import { api, type ChatMessage } from "../lib/api.js";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit" });
}

function MarkdownContent({ text }: { text: string }) {
  const elements = useMemo(() => parseMarkdown(text), [text]);
  return <>{elements}</>;
}

function parseMarkdown(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const result: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      result.push(
        <pre key={key++} className="bg-zinc-950 border border-zinc-800/60 rounded-md px-3.5 py-2.5 my-2 overflow-x-auto">
          {lang && <span className="text-[10px] text-zinc-600 block mb-1 font-mono uppercase">{lang}</span>}
          <code className="text-[13px] text-zinc-300 font-mono leading-relaxed">{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (line.trim() === "") {
      result.push(<div key={key++} className="h-1.5" />);
      i++;
      continue;
    }

    if (/^[\-\*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\-\*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\-\*]\s/, ""));
        i++;
      }
      result.push(
        <ul key={key++} className="list-none space-y-0.5 my-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-[13px] text-zinc-300 leading-relaxed">
              <span className="text-zinc-600 shrink-0">-</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+[\.\\)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[\.\\)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[\.\\)]\s/, ""));
        i++;
      }
      result.push(
        <ol key={key++} className="list-none space-y-0.5 my-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2 text-[13px] text-zinc-300 leading-relaxed">
              <span className="text-zinc-600 shrink-0 tabular-nums w-4 text-right">{idx + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    result.push(
      <p key={key++} className="text-[13px] text-zinc-300 leading-relaxed">{renderInline(line)}</p>,
    );
    i++;
  }

  return result;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      parts.push(<code key={match.index} className="bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded-sm text-[12px] font-mono">{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      parts.push(<strong key={match.index} className="text-zinc-200 font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      parts.push(<em key={match.index} className="text-zinc-300 italic">{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts;
}

const SUGGESTIONS = [
  "How are you performing today?",
  "What tasks have you completed recently?",
  "What are your specialties?",
  "What have you learned so far?",
];

export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.getChat()
      .then((data) => setMessages(data.messages))
      .catch((err) => console.warn("Failed to load chat history:", err));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  async function send(text?: string) {
    const msg = text ?? input.trim();
    if (!msg || sending) return;
    setInput("");
    setSending(true);

    const userMsg: ChatMessage = { role: "user", content: msg, timestamp: Date.now() };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const { reply } = await api.sendChat(msg);
      setMessages((prev) => [...prev, { role: "assistant", content: reply, timestamp: Date.now() }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: `[ERROR] ${err instanceof Error ? err.message : "Failed to respond"}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  async function handleClear() {
    await api.clearChat();
    setMessages([]);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-3xl font-bold text-zinc-100 tracking-tight mb-1.5">Chat</h1>
          <p className="text-sm text-zinc-500">Talk directly with your agent</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={() => void handleClear()}
            className="text-[12px] text-zinc-600 hover:text-zinc-400 transition-colors font-medium"
          >
            Clear history
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto card mb-3">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <p className="text-zinc-300 text-base font-semibold mb-1">Start a conversation</p>
              <p className="text-zinc-600 text-sm mb-5">Ask your agent anything about its status, tasks, or capabilities</p>
              <div className="grid grid-cols-2 gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="text-left px-3.5 py-2.5 rounded-md border border-zinc-800/80 bg-zinc-900/60 text-[13px] text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {messages.map((msg) => (
              <div
                key={`${msg.timestamp}-${msg.role}`}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[75%] rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-zinc-800 text-zinc-200"
                    : "bg-zinc-900/80 border border-zinc-800/60"
                }`}>
                  <div><MarkdownContent text={msg.content} /></div>
                  <p className="text-[10px] mt-2 text-zinc-700 tabular-nums font-mono">{formatTime(msg.timestamp)}</p>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-zinc-900/80 border border-zinc-800/60 rounded-lg px-4 py-3">
                  <span className="text-[13px] text-zinc-500">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="flex gap-2.5 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          placeholder="Type a message..."
          disabled={sending}
          rows={1}
          className="flex-1 bg-zinc-900/80 border border-zinc-800/80 rounded-lg px-4 py-3 text-[13px] text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors disabled:opacity-40 resize-none leading-relaxed"
        />
        <button
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          className="px-5 py-3 rounded-md text-[13px] font-semibold transition-colors disabled:opacity-20 text-white bg-red-600 hover:bg-red-500 shrink-0"
        >
          Send
        </button>
      </div>
    </div>
  );
}
