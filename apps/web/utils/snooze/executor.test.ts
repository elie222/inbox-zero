import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import prisma from "@/utils/__mocks__/prisma";
import { releaseSnoozedThreadForRetry } from "@/utils/snooze/scheduler";
import { executeSnoozedThread } from "./executor";

vi.mock("@/utils/prisma");
vi.mock("@/utils/snooze/scheduler", () => ({
  releaseSnoozedThreadForRetry: vi.fn(),
}));

const logger = createTestLogger();
const snoozedThread = {
  id: "snooze",
  threadId: "thread",
} as never;
const leaseStartedAt = new Date("2026-08-16T09:30:00.000Z");

describe("executeSnoozedThread", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
  });

  it("restores the thread and completes the snooze", async () => {
    const provider = createMockEmailProvider();

    const result = await executeSnoozedThread(
      snoozedThread,
      provider,
      logger,
      leaseStartedAt,
    );

    expect(result.success).toBe(true);
    expect(provider.unarchiveThread).toHaveBeenCalledWith("thread");
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        id: "snooze",
        status: SnoozedThreadStatus.EXECUTING,
        updatedAt: leaseStartedAt,
      },
      data: { status: SnoozedThreadStatus.COMPLETED },
    });
  });

  it("records a failed provider restoration", async () => {
    const provider = createMockEmailProvider({
      unarchiveThread: vi.fn().mockRejectedValue(new Error("offline")),
    });

    const result = await executeSnoozedThread(
      snoozedThread,
      provider,
      logger,
      leaseStartedAt,
    );

    expect(result.success).toBe(false);
    expect(releaseSnoozedThreadForRetry).toHaveBeenCalledWith(
      "snooze",
      leaseStartedAt,
    );
  });

  it("leaves a restored thread claim for stale recovery when finalization fails", async () => {
    prisma.snoozedThread.updateMany.mockRejectedValue(new Error("offline"));
    const provider = createMockEmailProvider();

    const result = await executeSnoozedThread(
      snoozedThread,
      provider,
      logger,
      leaseStartedAt,
    );

    expect(result.success).toBe(false);
    expect(provider.unarchiveThread).toHaveBeenCalledWith("thread");
    expect(releaseSnoozedThreadForRetry).not.toHaveBeenCalled();
  });

  it("reports failure when another execution owns the completion claim", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 0 });
    const provider = createMockEmailProvider();

    const result = await executeSnoozedThread(
      snoozedThread,
      provider,
      logger,
      leaseStartedAt,
    );

    expect(result.success).toBe(false);
    expect(provider.unarchiveThread).toHaveBeenCalledWith("thread");
    expect(releaseSnoozedThreadForRetry).not.toHaveBeenCalled();
  });
});
