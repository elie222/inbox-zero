import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import {
  cancelSnoozedThread,
  scheduleSnoozedThread,
} from "@/utils/snooze/scheduler";
import { snoozeThreads } from "./snooze";

vi.mock("@/utils/snooze/scheduler", () => ({
  cancelSnoozedThread: vi.fn(),
  scheduleSnoozedThread: vi.fn(),
}));

const logger = createTestLogger();
const snoozedUntil = new Date("2026-08-16T09:00:00.000Z");

describe("snoozeThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(scheduleSnoozedThread).mockImplementation(
      async ({ threadId }) =>
        ({
          id: `snooze-${threadId}`,
        }) as never,
    );
  });

  it("schedules restoration before archiving every unique thread", async () => {
    const provider = createMockEmailProvider();

    const result = await snoozeThreads({
      emailAccountId: "account",
      logger,
      ownerEmail: "owner@example.com",
      provider,
      snoozedUntil,
      threadIds: ["one", "one", "two"],
    });

    expect(result).toEqual({
      failedThreadIds: [],
      succeededThreadIds: ["one", "two"],
    });
    expect(scheduleSnoozedThread).toHaveBeenCalledTimes(2);
    expect(scheduleSnoozedThread).toHaveBeenNthCalledWith(1, {
      emailAccountId: "account",
      scheduledFor: snoozedUntil,
      threadId: "one",
    });
    expect(
      vi.mocked(scheduleSnoozedThread).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(provider.archiveThreadWithLabel).mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    );
    expect(provider.archiveThreadWithLabel).toHaveBeenCalledWith(
      "one",
      "owner@example.com",
    );
  });

  it("cancels restoration when the provider cannot archive a thread", async () => {
    const provider = createMockEmailProvider({
      archiveThreadWithLabel: vi
        .fn()
        .mockRejectedValue(new Error("provider failed")),
    });

    const result = await snoozeThreads({
      emailAccountId: "account",
      logger,
      ownerEmail: "owner@example.com",
      provider,
      snoozedUntil,
      threadIds: ["one"],
    });

    expect(result).toEqual({
      failedThreadIds: ["one"],
      succeededThreadIds: [],
    });
    expect(cancelSnoozedThread).toHaveBeenCalledWith("snooze-one");
  });

  it("does not archive when restoration could not be scheduled", async () => {
    vi.mocked(scheduleSnoozedThread).mockRejectedValue(new Error("offline"));
    const provider = createMockEmailProvider();

    const result = await snoozeThreads({
      emailAccountId: "account",
      logger,
      ownerEmail: "owner@example.com",
      provider,
      snoozedUntil,
      threadIds: ["one"],
    });

    expect(result.failedThreadIds).toEqual(["one"]);
    expect(provider.archiveThreadWithLabel).not.toHaveBeenCalled();
  });

  it("reports successful and failed threads independently", async () => {
    const provider = createMockEmailProvider({
      archiveThreadWithLabel: vi.fn(async (threadId: string) => {
        if (threadId === "two") throw new Error("provider failed");
      }),
    });

    const result = await snoozeThreads({
      emailAccountId: "account",
      logger,
      ownerEmail: "owner@example.com",
      provider,
      snoozedUntil,
      threadIds: ["one", "two"],
    });

    expect(result).toEqual({
      failedThreadIds: ["two"],
      succeededThreadIds: ["one"],
    });
    expect(cancelSnoozedThread).toHaveBeenCalledWith("snooze-two");
  });
});
