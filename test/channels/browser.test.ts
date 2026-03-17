import { describe, it, expect } from "vitest";
import { BrowserChannel } from "../../src/channels/browser/index.js";

describe("BrowserChannel", () => {
  it("has correct name and empty config", () => {
    const ch = new BrowserChannel();
    expect(ch.name).toBe("browser");
    expect(ch.requiredConfig).toEqual([]);
  });

  it("registers a message handler via onMessage", () => {
    const ch = new BrowserChannel();
    const handler = async () => ({ text: "hello" });
    ch.onMessage(handler);
    // No error thrown — handler accepted
  });

  it("start and stop resolve without error", async () => {
    const ch = new BrowserChannel();
    await ch.start({});
    await ch.stop();
  });
});
