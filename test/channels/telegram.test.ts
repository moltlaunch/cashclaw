import { describe, it, expect } from "vitest";
import { TelegramChannel } from "../../src/channels/telegram/index.js";

describe("TelegramChannel", () => {
  it("has correct name and config", () => {
    const ch = new TelegramChannel();
    expect(ch.name).toBe("telegram");
    expect(ch.requiredConfig).toContain("token");
  });

  it("registers handler without error", () => {
    const ch = new TelegramChannel();
    ch.onMessage(async () => ({ text: "ok" }));
    // no error means success
  });

  it("throws if started without a handler", async () => {
    const ch = new TelegramChannel();
    await expect(ch.start({ token: "fake" })).rejects.toThrow(
      "call onMessage() before start()",
    );
  });
});
