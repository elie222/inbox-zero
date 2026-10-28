import { describe, expect, it } from "vitest";
import { mailEngineConnectionCopy } from "./connection-notice";

describe("mailEngineConnectionCopy", () => {
  it("asks the user to reconnect when auth is blocked", () => {
    expect(mailEngineConnectionCopy("blocked_auth")).toEqual({
      title: "Reconnect this account to continue syncing.",
      description:
        "Mailbox catch-up is paused until this account is reconnected.",
      action: "Reconnect",
    });
  });

  it("explains automatic retry while the mailbox is offline", () => {
    expect(mailEngineConnectionCopy("offline")).toEqual({
      title: "Waiting to sync.",
      description: "Catch-up will retry automatically.",
    });
  });

  it("is silent while the mailbox is ready", () => {
    expect(mailEngineConnectionCopy("ready")).toBeUndefined();
    expect(mailEngineConnectionCopy(undefined)).toBeUndefined();
  });
});
