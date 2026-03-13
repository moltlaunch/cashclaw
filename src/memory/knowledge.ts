import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getConfigDir } from "../config.js";

export interface KnowledgeEntry {
  id: string;
  topic: "feedback_analysis" | "specialty_research" | "task_simulation";
  specialty: string;
  insight: string;
  source: string;
  timestamp: number;
}

const MAX_ENTRIES = 50;

function getKnowledgePath(): string {
  return path.join(getConfigDir(), "knowledge.json");
}

let cache: KnowledgeEntry[] | null = null;

function readFromDisk(): KnowledgeEntry[] {
  const p = getKnowledgePath();
  if (!fs.existsSync(p)) return [];
  try {
    const raw = fs.readFileSync(p, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is KnowledgeEntry =>
        typeof e === "object" && e !== null &&
        typeof (e as KnowledgeEntry).id === "string" &&
        typeof (e as KnowledgeEntry).insight === "string",
    );
  } catch {
    return [];
  }
}

export function loadKnowledge(): KnowledgeEntry[] {
  if (cache) return cache;
  cache = readFromDisk();
  return cache;
}

export function storeKnowledge(entry: KnowledgeEntry): void {
  import("./search.js")
    .then((m) => m.invalidateIndex())
    .catch((err) => console.error("Failed to invalidate search index:", err));

  const entries = loadKnowledge();
  entries.push(entry);

  const trimmed = entries.slice(-MAX_ENTRIES);
  cache = trimmed;

  const p = getKnowledgePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(trimmed, null, 2));
  fs.renameSync(tmp, p);
}

export function deleteKnowledge(id: string): boolean {
  const entries = loadKnowledge();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return false;

  entries.splice(idx, 1);
  cache = entries;

  import("./search.js")
    .then((m) => m.invalidateIndex())
    .catch((err) => console.error("Failed to invalidate search index:", err));

  const p = getKnowledgePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2));
  fs.renameSync(tmp, p);
  return true;
}

/** Returns entries matching any of the given specialties, most recent first */
export function getRelevantKnowledge(
  specialties: string[],
  limit = 5,
): KnowledgeEntry[] {
  const entries = loadKnowledge();
  const lowerSpecs = new Set(specialties.map((s) => s.toLowerCase()));

  const matching = entries.filter(
    (e) => lowerSpecs.has(e.specialty.toLowerCase()) || e.specialty === "general",
  );

  return matching
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}
