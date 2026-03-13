import type { LLMProvider, LLMMessage } from "../llm/types.js";
import type { CashClawConfig } from "../config.js";
import { loadFeedback, type FeedbackEntry } from "../memory/feedback.js";
import {
  loadKnowledge,
  storeKnowledge,
  type KnowledgeEntry,
} from "../memory/knowledge.js";

export interface StudyResult {
  topic: KnowledgeEntry["topic"];
  insight: string;
  tokensUsed: number;
}

const STUDY_TOPICS: KnowledgeEntry["topic"][] = [
  "feedback_analysis",
  "specialty_research",
  "task_simulation",
];

const MAX_STUDY_TURNS = 3;

/** Pick the next topic by rotating through the list based on past entries */
function pickTopic(existing: KnowledgeEntry[], feedback: FeedbackEntry[]): KnowledgeEntry["topic"] {
  // Skip feedback_analysis if there's no feedback to analyze
  const eligible = feedback.length > 0
    ? STUDY_TOPICS
    : STUDY_TOPICS.filter((t) => t !== "feedback_analysis");

  const counts = new Map<string, number>();
  for (const topic of eligible) counts.set(topic, 0);
  for (const e of existing) {
    if (eligible.includes(e.topic)) {
      counts.set(e.topic, (counts.get(e.topic) ?? 0) + 1);
    }
  }

  let minTopic = eligible[0];
  let minCount = Infinity;
  for (const topic of eligible) {
    const count = counts.get(topic) ?? 0;
    if (count < minCount) {
      minCount = count;
      minTopic = topic;
    }
  }
  return minTopic;
}

function buildStudyPrompt(
  topic: KnowledgeEntry["topic"],
  config: CashClawConfig,
  feedback: FeedbackEntry[],
  knowledge: KnowledgeEntry[],
): string {
  const specialties = config.specialties.length > 0
    ? config.specialties.join(", ")
    : "general-purpose tasks";

  const recentFeedback = feedback.slice(-10);
  const feedbackSummary = recentFeedback.length > 0
    ? recentFeedback
        .map((f) => `- Score ${f.score}/5: "${f.taskDescription}" — ${f.comments || "no comment"}`)
        .join("\n")
    : "No feedback yet.";

  const existingKnowledge = knowledge.slice(-5)
    .map((k) => `- [${k.topic}] ${k.insight.slice(0, 150)}`)
    .join("\n") || "None yet.";

  const base = `You are a self-improving autonomous agent specializing in: ${specialties}.
You are conducting a study session to improve your future task performance.

## Your existing knowledge
${existingKnowledge}

## Recent feedback from clients
${feedbackSummary}
`;

  switch (topic) {
    case "feedback_analysis":
      return `${base}
## Task: Feedback Analysis

Analyze the feedback patterns above. What patterns emerge? What kinds of tasks scored well vs poorly? What specific improvements should you make?

Produce a concise insight (2-3 paragraphs) that will help you perform better on future tasks. Focus on actionable takeaways.`;

    case "specialty_research":
      return `${base}
## Task: Specialty Deep-Dive

As a specialist in ${specialties}, research and articulate:
1. Common best practices and quality standards
2. Frequent pitfalls and how to avoid them
3. Patterns that distinguish excellent work from mediocre work

Produce a concise insight (2-3 paragraphs) with concrete, actionable knowledge.`;

    case "task_simulation":
      return `${base}
## Task: Practice Simulation

Generate a realistic task request that a client might submit for your specialties (${specialties}). Then produce an outline of how you would approach it — the key decisions, quality checks, and deliverable structure.

Produce a concise insight (2-3 paragraphs) covering the approach and lessons learned.`;
  }
}

function generateId(): string {
  return crypto.randomUUID();
}

export async function runStudySession(
  llm: LLMProvider,
  config: CashClawConfig,
): Promise<StudyResult> {
  const feedback = loadFeedback();
  const knowledge = loadKnowledge();
  const topic = pickTopic(knowledge, feedback);

  // Rotate through specialties instead of always using the first one
  const specialtyPool = config.specialties.length > 0 ? config.specialties : ["general"];
  const topicEntries = knowledge.filter((k) => k.topic === topic);
  const specialty = specialtyPool[topicEntries.length % specialtyPool.length];
  const prompt = buildStudyPrompt(topic, config, feedback, knowledge);

  const messages: LLMMessage[] = [
    { role: "user", content: prompt },
  ];

  let totalTokens = 0;
  let lastText = "";

  // Run up to MAX_STUDY_TURNS — no tools, pure reasoning
  for (let turn = 0; turn < MAX_STUDY_TURNS; turn++) {
    const response = await llm.chat(messages);
    totalTokens += response.usage.inputTokens + response.usage.outputTokens;

    const textBlocks = response.content.filter(
      (b): b is { type: "text"; text: string } => b.type === "text",
    );
    lastText = textBlocks.map((b) => b.text).join("\n");

    // Single turn is usually enough for study sessions
    if (response.stopReason === "end_turn") break;

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: "Continue your analysis. Focus on the most actionable insight.",
    });
  }

  const insight = lastText.trim() || "No insight produced.";

  // Determine what triggered this study
  const source = topic === "feedback_analysis" && feedback.length > 0
    ? `${feedback.length} feedback entries (avg ${(feedback.reduce((s, f) => s + f.score, 0) / feedback.length).toFixed(1)}/5)`
    : `scheduled ${topic} session`;

  const entry: KnowledgeEntry = {
    id: generateId(),
    topic,
    specialty,
    insight,
    source,
    timestamp: Date.now(),
  };

  storeKnowledge(entry);

  return { topic, insight, tokensUsed: totalTokens };
}
