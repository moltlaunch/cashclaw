import type { Tool, ToolResult } from "./types.js";

// ---------------------------------------------------------------------------
// Minimal cron-expression parser (supports "m h dom mon dow" five-field format)
// ---------------------------------------------------------------------------

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
}

function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) values.add(i);
      continue;
    }

    const stepMatch = part.match(/^(\*|\d+-\d+)\/(\d+)$/);
    if (stepMatch) {
      let start = min;
      let end = max;
      if (stepMatch[1] !== "*") {
        const [s, e] = stepMatch[1].split("-").map(Number);
        start = s;
        end = e;
      }
      const step = Number(stepMatch[2]);
      for (let i = start; i <= end; i += step) values.add(i);
      continue;
    }

    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      for (let i = start; i <= end; i++) values.add(i);
      continue;
    }

    const num = Number(part);
    if (!Number.isNaN(num) && num >= min && num <= max) {
      values.add(num);
    }
  }

  return values;
}

function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron expression "${expression}": expected 5 fields (minute hour dom month dow)`,
    );
  }
  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 6),
  };
}

function cronMatches(fields: CronFields, date: Date): boolean {
  return (
    fields.minute.has(date.getMinutes()) &&
    fields.hour.has(date.getHours()) &&
    fields.dayOfMonth.has(date.getDate()) &&
    fields.month.has(date.getMonth() + 1) &&
    fields.dayOfWeek.has(date.getDay())
  );
}

// ---------------------------------------------------------------------------
// In-memory task store
// ---------------------------------------------------------------------------

export interface ScheduledTask {
  name: string;
  cronExpression: string;
  command: string;
  fields: CronFields;
  lastRun: number;
}

const tasks = new Map<string, ScheduledTask>();

/** Interval handle for the scheduler tick loop. */
let tickHandle: ReturnType<typeof setInterval> | null = null;
/** Registered callback invoked when a task fires. */
let onFire: ((task: ScheduledTask) => void) | null = null;

/** Start the scheduler tick (checks once per minute). */
function ensureTicking(): void {
  if (tickHandle) return;
  tickHandle = setInterval(() => {
    const now = new Date();
    for (const task of tasks.values()) {
      if (cronMatches(task.fields, now) && now.getTime() - task.lastRun > 59_000) {
        task.lastRun = now.getTime();
        onFire?.(task);
      }
    }
  }, 60_000);
  // Allow the process to exit even if the interval is running.
  if (tickHandle && typeof tickHandle === "object" && "unref" in tickHandle) {
    tickHandle.unref();
  }
}

/** Stop the scheduler tick loop. */
export function stopScheduler(): void {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

/** Register a callback for when a scheduled task fires. */
export function onTaskFire(cb: (task: ScheduledTask) => void): void {
  onFire = cb;
}

// ---------------------------------------------------------------------------
// Tool actions
// ---------------------------------------------------------------------------

function handleAdd(params: Record<string, unknown>): ToolResult {
  const name = params.name;
  if (typeof name !== "string" || !name.trim()) {
    return { success: false, output: "Missing required parameter: name", error: "missing_param" };
  }
  const cronExpression = params.cron_expression;
  if (typeof cronExpression !== "string" || !cronExpression.trim()) {
    return { success: false, output: "Missing required parameter: cron_expression", error: "missing_param" };
  }
  const command = params.command;
  if (typeof command !== "string" || !command.trim()) {
    return { success: false, output: "Missing required parameter: command", error: "missing_param" };
  }

  let fields: CronFields;
  try {
    fields = parseCron(cronExpression);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: msg, error: "invalid_cron" };
  }

  const task: ScheduledTask = {
    name: name.trim(),
    cronExpression: cronExpression.trim(),
    command: command.trim(),
    fields,
    lastRun: 0,
  };

  tasks.set(task.name, task);
  ensureTicking();

  return { success: true, output: `Scheduled task "${task.name}" with cron "${task.cronExpression}".` };
}

function handleRemove(params: Record<string, unknown>): ToolResult {
  const name = params.name;
  if (typeof name !== "string" || !name.trim()) {
    return { success: false, output: "Missing required parameter: name", error: "missing_param" };
  }
  const deleted = tasks.delete(name.trim());
  if (!deleted) {
    return { success: false, output: `No scheduled task named "${name.trim()}".`, error: "not_found" };
  }
  if (tasks.size === 0) stopScheduler();
  return { success: true, output: `Removed scheduled task "${name.trim()}".` };
}

function handleList(): ToolResult {
  if (tasks.size === 0) {
    return { success: true, output: "No scheduled tasks." };
  }
  const lines = [...tasks.values()].map(
    (t) => `- ${t.name}: "${t.cronExpression}" -> ${t.command}`,
  );
  return { success: true, output: `${tasks.size} scheduled task(s):\n${lines.join("\n")}` };
}

export const schedulerTool: Tool = {
  name: "scheduler",
  description:
    "Manage scheduled tasks using cron expressions. " +
    "action=add to create a task (requires name, cron_expression, command), " +
    "action=remove to delete a task by name, action=list to show all tasks.",
  parameters: [
    { name: "action", type: "string", description: "One of: add, remove, list", required: true },
    { name: "name", type: "string", description: "Task name (required for add/remove)" },
    { name: "cron_expression", type: "string", description: "Five-field cron expression, e.g. '*/5 * * * *' (required for add)" },
    { name: "command", type: "string", description: "Command to execute when the task fires (required for add)" },
  ],

  async execute(params: Record<string, unknown>): Promise<ToolResult> {
    const action = params.action;
    if (typeof action !== "string" || !action.trim()) {
      return { success: false, output: "Missing required parameter: action", error: "missing_param" };
    }

    switch (action.trim()) {
      case "add":
        return handleAdd(params);
      case "remove":
        return handleRemove(params);
      case "list":
        return handleList();
      default:
        return {
          success: false,
          output: `Unknown action: ${action}. Use add, remove, or list.`,
          error: "invalid_action",
        };
    }
  },
};
