import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import prisma from "@/utils/__mocks__/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { executeSnoozedThread } from "@/utils/snooze/executor";
import {
  markSnoozedThreadAsExecuting,
  releaseSnoozedThreadForRetry,
} from "@/utils/snooze/scheduler";
import { processDueSnoozedThreads } from "./process-due";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/snooze/executor", () => ({
  executeSnoozedThread: vi.fn(),
}));
vi.mock("@/utils/snooze/scheduler", () => ({
  markSnoozedThreadAsExecuting: vi.fn(),
  releaseSnoozedThreadForRetry: vi.fn(),
  SNOOZE_EXECUTION_LEASE_MS: 15 * 60 * 1000,
}));

const logger = createTestLogger();
const leaseStartedAt = new Date("2026-08-16T09:30:00.000Z");

describe("processDueSnoozedThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(markSnoozedThreadAsExecuting).mockResolvedValue(leaseStartedAt);
    vi.mocked(createEmailProvider).mockResolvedValue(createMockEmailProvider());
    vi.mocked(executeSnoozedThread).mockResolvedValue({ success: true });
  });

  it("restores due pending threads", async () => {
    prisma.snoozedThread.findMany.mockResolvedValue([
      {
        id: "snooze",
        emailAccountId: "account",
        emailAccount: { account: { provider: "google" } },
      },
    ] as never);

    const result = await processDueSnoozedThreads(logger);

    expect(result).toEqual({ processed: 1, failed: 0, skipped: 0, total: 1 });
    expect(markSnoozedThreadAsExecuting).toHaveBeenCalledWith("snooze");
    expect(executeSnoozedThread).toHaveBeenCalledWith(
      expect.objectContaining({ id: "snooze" }),
      expect.anything(),
      expect.anything(),
      leaseStartedAt,
    );
  });

  it("fails records whose email provider no longer exists", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
    prisma.snoozedThread.findMany.mockResolvedValue([
      {
        id: "snooze",
        emailAccountId: "account",
        emailAccount: null,
      },
    ] as never);

    const result = await processDueSnoozedThreads(logger);

    expect(result).toEqual({ processed: 0, failed: 1, skipped: 0, total: 1 });
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        id: "snooze",
        status: SnoozedThreadStatus.EXECUTING,
        updatedAt: leaseStartedAt,
      },
      data: { status: SnoozedThreadStatus.FAILED },
    });
  });

  it("skips work claimed by another worker", async () => {
    prisma.snoozedThread.findMany.mockResolvedValue([
      {
        id: "snooze",
        emailAccountId: "account",
        emailAccount: { account: { provider: "google" } },
      },
    ] as never);
    vi.mocked(markSnoozedThreadAsExecuting).mockResolvedValue(null);

    const result = await processDueSnoozedThreads(logger);

    expect(result).toEqual({ processed: 0, failed: 0, skipped: 1, total: 1 });
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(executeSnoozedThread).not.toHaveBeenCalled();
  });

  it("counts provider restoration failures", async () => {
    prisma.snoozedThread.findMany.mockResolvedValue([
      {
        id: "snooze",
        emailAccountId: "account",
        emailAccount: { account: { provider: "google" } },
      },
    ] as never);
    vi.mocked(executeSnoozedThread).mockResolvedValue({
      success: false,
      error: new Error("offline"),
    });

    const result = await processDueSnoozedThreads(logger);

    expect(result).toEqual({ processed: 0, failed: 1, skipped: 0, total: 1 });
  });

  it("releases a claim when provider creation throws", async () => {
    prisma.snoozedThread.findMany.mockResolvedValue([
      {
        id: "snooze",
        emailAccountId: "account",
        emailAccount: { account: { provider: "google" } },
      },
    ] as never);
    vi.mocked(createEmailProvider).mockRejectedValue(new Error("offline"));

    const result = await processDueSnoozedThreads(logger);

    expect(result).toEqual({ processed: 0, failed: 1, skipped: 0, total: 1 });
    expect(releaseSnoozedThreadForRetry).toHaveBeenCalledWith(
      "snooze",
      leaseStartedAt,
    );
  });
});
