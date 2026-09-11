import { describe, expect, it } from "vitest";
import { createMailNotificationTracker } from "./mail-notifications";

describe("mail notification tracker", () => {
  it("ignores startup backlog, stale mail, and future timestamps", () => {
    const track = createMailNotificationTracker(1_000_000);
    expect(
      track(
        {
          emailAccountId: "account",
          messages: [
            { id: "old", receivedAt: 999_999 },
            { id: "stale", receivedAt: 1_000_001 },
            { id: "future", receivedAt: 2_000_001 },
            { id: "invalid", receivedAt: Number.NaN },
          ],
        },
        2_000_000,
      ),
    ).toBeNull();
  });

  it("deduplicates sync replays while allowing new mail in the same account", () => {
    const track = createMailNotificationTracker(1000);
    const message = { id: "message", receivedAt: 1100 };
    expect(
      track({ emailAccountId: "account", messages: [message, message] }, 1200),
    ).toEqual({ emailAccountId: "account", count: 1 });
    expect(
      track({ emailAccountId: "account", messages: [message] }, 1300),
    ).toBeNull();
    expect(
      track({ emailAccountId: "other", messages: [message] }, 1300),
    ).toEqual({ emailAccountId: "other", count: 1 });
    expect(
      track(
        {
          emailAccountId: "account",
          messages: [message, { id: "reply", receivedAt: 1250 }],
        },
        1300,
      ),
    ).toEqual({ emailAccountId: "account", count: 1 });
  });

  it("rejects malformed IPC and account paths", () => {
    const track = createMailNotificationTracker(1000);
    for (const payload of [
      null,
      {},
      { emailAccountId: "../../login", messages: [] },
      { emailAccountId: "account", messages: "bad" },
      { emailAccountId: "account", messages: new Array(101).fill({}) },
      { emailAccountId: "account", messages: [null, {}, 42] },
    ]) {
      expect(track(payload, 1200)).toBeNull();
    }
  });
});
