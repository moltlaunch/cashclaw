import type { Tool } from "./types.js";
import * as cli from "../moltlaunch/cli.js";

function safeStringify(data: unknown): string {
  return JSON.stringify(data, (key, value) => {
    if (typeof value === "bigint") {
      return value.toString();
    }
    return value;
  });
}

function requireString(input: Record<string, unknown>, key: string): string {
  const val = input[key];
  if (typeof val !== "string" || !val) throw new Error(`Missing required field: ${key}`);
  return val;
}

export const readTask: Tool = {
  definition: {
    name: "read_task",
    description: "Get full details of a task including messages, files, status, and client feedback.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to read" },
      },
      required: ["task_id"],
    },
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const task = await cli.getTask(taskId);
    return { success: true, data: safeStringify(task) };
  },
};

export const quoteTask: Tool = {
  definition: {
    name: "quote_task",
    description: "Submit a price quote for a task. Price is in ETH (e.g. '0.005'). Include a message explaining your approach.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to quote" },
        price_eth: { type: "string", description: "Price in ETH (e.g. '0.005')" },
        message: { type: "string", description: "Message to client explaining your approach" },
      },
      required: ["task_id", "price_eth"],
    },
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const priceEth = requireString(input, "price_eth");
    await cli.quoteTask(taskId, priceEth, input.message as string | undefined);
    return { success: true, data: `Quoted task ${taskId} at ${priceEth} ETH` };
  },
};

export const declineTask: Tool = {
  definition: {
    name: "decline_task",
    description: "Decline a task with an optional reason. Use when the task is outside your expertise or inappropriate.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to decline" },
        reason: { type: "string", description: "Reason for declining" },
      },
      required: ["task_id"],
    },
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    await cli.declineTask(taskId, input.reason as string | undefined);
    return { success: true, data: `Declined task ${taskId}` };
  },
};

export const submitWork: Tool = {
  definition: {
    name: "submit_work",
    description: "Submit completed work for a task. The result should be the full deliverable (code, text, etc.).",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID to submit work for" },
        result: { type: "string", description: "The complete work deliverable" },
      },
      required: ["task_id", "result"],
    },
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const result = requireString(input, "result");
    await cli.submitWork(taskId, result);
    return { success: true, data: `Submitted work for task ${taskId}` };
  },
};

export const sendMessage: Tool = {
  definition: {
    name: "send_message",
    description: "Send a message to the client on a task thread. Use for clarifications, updates, or questions.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string", description: "The task ID" },
        content: { type: "string", description: "Message content" },
      },
      required: ["task_id", "content"],
    },
  },
  async execute(input) {
    const taskId = requireString(input, "task_id");
    const content = requireString(input, "content");
    await cli.sendMessage(taskId, content);
    return { success: true, data: `Message sent on task ${taskId}` };
  },
};

export const listBounties: Tool = {
  definition: {
    name: "list_bounties",
    description: "Browse open bounties on the marketplace. Returns available bounties with their descriptions and budgets.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  async execute() {
    const bounties = await cli.getBounties();
    return { success: true, data: safeStringify(bounties) };
  },
};

export const claimBounty: Tool = {
  definition: {
    name: "claim_bounty",
    description: "Claim an open bounty. Include a message explaining why you're a good fit.",
    input_schema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", description: "The bounty ID to claim" },
        message: { type: "string", description: "Why you're a good fit for this bounty" },
      },
      required: ["bounty_id"],
    },
  },
  async execute(input) {
    const bountyId = requireString(input, "bounty_id");
    await cli.claimBounty(bountyId, input.message as string | undefined);
    return { success: true, data: `Claimed bounty ${bountyId}` };
  },
};
