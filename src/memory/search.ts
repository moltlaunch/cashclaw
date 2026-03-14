import MiniSearch from "minisearch";
import { loadKnowledge, type KnowledgeEntry } from "./knowledge.js";
import { loadFeedback, type FeedbackEntry } from "./feedback.js";

// Simple mutex class to prevent concurrent index modifications
class Mutex {
  private locked = false;
  private waitQueue: (() => void)[] = [];

  async lock(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  unlock(): void {
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }

  async withLock<T>(fn: () => Promise<T> | T): Promise<T> {
    await this.lock();
    try {
      return await fn();
    } finally {
      this.unlock();
    }
  }
}

export interface MemoryHit {
  id: string;
  type: "knowledge" | "feedback";
  text: string;
  score: number;
  timestamp: number;
  meta: KnowledgeEntry | FeedbackEntry;
}

// Temporal decay: half-life of 30 days
const DECAY_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
const DECAY_LAMBDA = Math.LN2 / DECAY_HALF_LIFE_MS;

interface IndexDoc {
  id: string;
  type: "knowledge" | "feedback";
  text: string;
  timestamp: number;
}

let index: MiniSearch<IndexDoc> | null = null;
let docs: Map<string, { type: "knowledge" | "feedback"; meta: KnowledgeEntry | FeedbackEntry }> = new Map();
let indexedIds: Set<string> = new Set();
let dirty = false;

// CRITICAL FIX: Add mutex to prevent concurrent index corruption
const indexMutex = new Mutex();

function createIndex(): MiniSearch<IndexDoc> {
  return new MiniSearch<IndexDoc>({
    fields: ["text"],
    storeFields: ["type", "timestamp"],
    searchOptions: {
      boost: { text: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
}

/** Sync index with current data. Full rebuild only on first load or when entries were trimmed. */
async function syncIndex(): Promise<void> {
  // CRITICAL FIX: Protect all index modifications with mutex to prevent corruption
  await indexMutex.withLock(() => {
    const knowledge = loadKnowledge();
    const feedback = loadFeedback();
    const currentTotal = knowledge.length + feedback.length;

    // Full rebuild needed: first init, or entries were trimmed (fewer than indexed)
    const needsFullRebuild = !index || (dirty && currentTotal < indexedIds.size);
    if (needsFullRebuild) {
      index = createIndex();
      indexedIds.clear();
      docs.clear();
    }

    // After the branch above, index is guaranteed non-null
    const idx = index!;
    const newDocs: IndexDoc[] = [];

    for (const k of knowledge) {
      const id = `k:${k.id}`;
      if (indexedIds.has(id)) continue;
      const text = `${k.topic} ${k.specialty} ${k.insight}`;
      newDocs.push({ id, type: "knowledge", text, timestamp: k.timestamp });
      docs.set(id, { type: "knowledge", meta: k });
      indexedIds.add(id);
    }

    for (const f of feedback) {
      const id = `f:${f.taskId}`;
      if (indexedIds.has(id)) continue;
      const text = `${f.taskDescription} score:${f.score} ${f.comments}`;
      newDocs.push({ id, type: "feedback", text, timestamp: f.timestamp });
      docs.set(id, { type: "feedback", meta: f });
      indexedIds.add(id);
    }

    if (newDocs.length > 0) {
      idx.addAll(newDocs);
    }

    dirty = false;
  });
}

async function ensureIndex(): Promise<void> {
  if (!index || dirty) {
    await syncIndex();
  }
}

/** Mark index as stale so next search picks up new entries */
export async function invalidateIndex(): Promise<void> {
  // CRITICAL FIX: Protect dirty flag modification with mutex
  await indexMutex.withLock(() => {
    dirty = true;
  });
}

/**
 * Search memory for entries relevant to a query string.
 * Returns scored results with temporal decay applied.
 */
export async function searchMemory(query: string, limit = 5): Promise<MemoryHit[]> {
  if (!query.trim()) return [];

  // CRITICAL FIX: Use async ensureIndex() to prevent concurrent index corruption
  await ensureIndex();
  if (!index) return [];

  const results = index.search(query);

  const now = Date.now();

  const scored: MemoryHit[] = results
    .map((r) => {
      const doc = docs.get(r.id);
      if (!doc) return null;

      const age = now - (r.timestamp as number);
      const decay = Math.exp(-DECAY_LAMBDA * age);
      const finalScore = r.score * decay;

      let text: string;
      if (doc.type === "knowledge") {
        const k = doc.meta as KnowledgeEntry;
        text = `[${k.topic}/${k.specialty}] ${k.insight}`;
      } else {
        const f = doc.meta as FeedbackEntry;
        text = `[${f.score}/5] "${f.taskDescription}" — ${f.comments || "no comment"}`;
      }

      return {
        id: r.id,
        type: doc.type,
        text,
        score: finalScore,
        timestamp: r.timestamp as number,
        meta: doc.meta,
      };
    })
    .filter((h): h is MemoryHit => h !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored;
}
