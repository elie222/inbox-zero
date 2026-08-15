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
          scheduledId: `qstash-${threadId}`,
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
    expect(cancelSnoozedThread).toHaveBeenCalledWith({
      id: "snooze-one",
      scheduledId: "qstash-one",
    });
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
});
