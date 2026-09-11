import { describe, expect, it } from "vitest";
import { isExpiredUnsyncedSnooze } from "./mail-mutation-policy";
import type { MailMutation } from "./mail-mutations";

describe("mail mutation policy", () => {
  it("rejects a snooze that expired before its first server attempt", () => {
    expect(isExpiredUnsyncedSnooze(snoozeMutation({ attempts: 1 }), 1001)).toBe(
      true,
    );
  });

  it("replays an expired snooze after an ambiguous first response", () => {
    expect(isExpiredUnsyncedSnooze(snoozeMutation({ attempts: 2 }), 1001)).toBe(
      false,
    );
  });
});

function snoozeMutation({ attempts }: { attempts: number }): MailMutation {
  return {
    id: "mutation",
    batchId: "batch",
    emailAccountId: "account",
    threadId: "thread",
    messageIds: ["message"],
    kind: "snooze",
    scheduledFor: new Date(1000).toISOString(),
    status: "processing",
    attempts,
    nextAttemptAt: 0,
    leaseOwner: "owner",
    leaseExpiresAt: 10_000,
    createdAt: 0,
    updatedAt: 0,
  };
}
