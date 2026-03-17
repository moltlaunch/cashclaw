import crypto from "node:crypto";
import type { Tool, ToolResult } from "./types.js";
import {
  loadKnowledge,
  storeKnowledge,
  deleteKnowledge,
  type KnowledgeEntry,
} from "../../memory/knowledge.js";
import { searchMemory } from "../../memory/search.js";

function requireString(
  params: Record<string, unknown>,
  key: string,
): string {
  const val = params[key];
  if (typeof val !== "string" || !val.trim()) {
    throw new Error(`Missing required parameter: ${key}`);
  }
  return val.trim();
}

function handleSearch(params: Record<string, unknown>): ToolResult {
  const query = requireString(params, "query");
  const limit =
    typeof params.limit === "number" && params.limit > 0
      ? params.limit
      : 5;

  const hits = searchMemory(query, limit);

  if (hits.length === 0) {
    return { success: true, output: "No relevant memories found." };
  }

  const summary = hits
    .map((h, i) => `${i + 1}. [${h.type}] ${h.text.slice(0, 300)}`)
    .join("\n\n");

  return { success: true, output: summary };
}

function handleSave(params: Record<string, unknown>): ToolResult {
  const insight = requireString(params, "content");
  const specialty =
    typeof params.specialty === "string" && params.specialty.trim()
      ? params.specialty.trim()
      : "general";
  const topic =
    typeof params.topic === "string" && params.topic.trim()
      ? (params.topic.trim() as KnowledgeEntry["topic"])
      : "specialty_research";

  const entry: KnowledgeEntry = {
    id: crypto.randomUUID(),
    topic,
    specialty,
    insight,
    source: "memory_tool",
    timestamp: Date.now(),
  };

  storeKnowledge(entry);
  return { success: true, output: `Saved knowledge entry ${entry.id}.` };
}

function handleDelete(params: Record<string, unknown>): ToolResult {
  const id = requireString(params, "id");
  const deleted = deleteKnowledge(id);
  if (!deleted) {
    return { success: false, output: `Entry not found: ${id}`, error: "not_found" };
  }
  return { success: true, output: `Deleted entry ${id}.` };
}

function handleList(): ToolResult {
  const entries = loadKnowledge();
  if (entries.length === 0) {
    return { success: true, output: "Knowledge base is empty." };
  }

  const summary = entries
    .map(
      (e) =>
        `- ${e.id}: [${e.topic}/${e.specialty}] ${e.insight.slice(0, 120)}`,
    )
    .join("\n");

  return {
    success: true,
    output: `${entries.length} entries:\n${summary}`,
  };
}

export const memoryTool: Tool = {
  name: "memory",
  description:
    "Search, save, delete, or list entries in the knowledge base. " +
    "Use action=search with a query to find relevant past knowledge, " +
    "action=save to add new knowledge, action=delete to remove an entry, " +
    "or action=list to see all entries.",
  parameters: [
    { name: "action", type: "string", description: "One of: search, save, delete, list", required: true },
    { name: "query", type: "string", description: "Search query (required for action=search)" },
    { name: "content", type: "string", description: "Knowledge content to save (required for action=save)" },
    { name: "specialty", type: "string", description: "Specialty tag for the entry (optional, default: general)" },
    { name: "topic", type: "string", description: "Topic: feedback_analysis, specialty_research, or task_simulation (optional)" },
    { name: "id", type: "string", description: "Entry ID (required for action=delete)" },
    { name: "limit", type: "number", description: "Max results for search (default 5)" },
  ],

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const action = requireString(params, "action");

    switch (action) {
      case "search":
        return handleSearch(params);
      case "save":
        return handleSave(params);
      case "delete":
        return handleDelete(params);
      case "list":
        return handleList();
      default:
        return {
          success: false,
          output: `Unknown action: ${action}. Use search, save, delete, or list.`,
          error: "invalid_action",
        };
    }
  },
};
