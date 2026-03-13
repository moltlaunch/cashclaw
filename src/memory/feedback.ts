import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getConfigDir } from "../config.js";

export interface FeedbackEntry {
  taskId: string;
  taskDescription: string;
  score: number;
  comments: string;
  timestamp: number;
}

const MAX_ENTRIES = 100;

function getFeedbackPath(): string {
  return path.join(getConfigDir(), "feedback.json");
}

// In-memory cache — avoids re-reading from disk on every call
let cache: FeedbackEntry[] | null = null;

function readFromDisk(): FeedbackEntry[] {
  const p = getFeedbackPath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is FeedbackEntry =>
        typeof e === "object" && e !== null &&
        typeof (e as FeedbackEntry).taskId === "string" &&
        typeof (e as FeedbackEntry).score === "number",
    );
  } catch {
    return [];
  }
}

export function loadFeedback(): FeedbackEntry[] {
  if (cache) return cache;
  cache = readFromDisk();
  return cache;
}

export function storeFeedback(entry: FeedbackEntry): void {
  import("./search.js")
    .then((m) => m.invalidateIndex())
    .catch((err) => console.error("Failed to invalidate search index:", err));

  const entries = loadFeedback();
  entries.push(entry);

  const trimmed = entries.slice(-MAX_ENTRIES);
  cache = trimmed;

  const p = getFeedbackPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2));
  fs.renameSync(tmp, p);
}

export function getFeedbackStats(): {
  totalTasks: number;
  avgScore: number;
  completionRate: number;
} {
  const entries = loadFeedback();
  if (entries.length === 0) {
    return { totalTasks: 0, avgScore: 0, completionRate: 0 };
  }

  const scored = entries.filter((e) => e.score > 0);
  const avgScore =
    scored.length > 0
      ? scored.reduce((sum, e) => sum + e.score, 0) / scored.length
      : 0;

  return {
    totalTasks: entries.length,
    avgScore: Math.round(avgScore * 10) / 10,
    completionRate: Math.round((scored.length / entries.length) * 100),
  };
}
