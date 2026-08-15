import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  cancelSnoozedThread,
  markSnoozedThreadAsExecuting,
  releaseSnoozedThreadForRetry,
  scheduleSnoozedThread,
} from "./scheduler";

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({ env: { QSTASH_TOKEN: "" } }));

describe("snoozed thread scheduler without QStash", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations),
    );
  });

  it("persists work for the cron fallback", async () => {
    const preparedRecord = { id: "snooze", scheduledId: null } as never;
    const activeRecord = {
      id: "snooze",
      scheduledId: null,
      status: SnoozedThreadStatus.PENDING,
    } as never;
    prisma.snoozedThread.findMany.mockResolvedValue([]);
    prisma.snoozedThread.create.mockResolvedValue(preparedRecord);
    prisma.snoozedThread.update.mockResolvedValue(activeRecord);
    const scheduledFor = new Date("2026-08-16T09:00:00.000Z");

    const result = await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor,
      threadId: "thread",
    });

    expect(result).toBe(activeRecord);
    expect(prisma.snoozedThread.create).toHaveBeenCalledWith({
      data: {
        emailAccountId: "account",
        scheduledFor,
        status: SnoozedThreadStatus.PREPARING,
        threadId: "thread",
      },
    });
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account",
        threadId: "thread",
        status: SnoozedThreadStatus.PENDING,
      },
      data: { status: SnoozedThreadStatus.CANCELLED },
    });
    expect(prisma.snoozedThread.update).toHaveBeenCalledWith({
      where: { id: "snooze" },
      data: { status: SnoozedThreadStatus.PENDING },
    });
  });

  it("claims pending work only once", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
    const executionToken = await markSnoozedThreadAsExecuting("snooze");

    expect(executionToken).toEqual(expect.any(String));

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        id: "snooze",
        OR: [
          { status: SnoozedThreadStatus.PENDING },
          {
            status: SnoozedThreadStatus.EXECUTING,
            updatedAt: { lte: expect.any(Date) },
          },
        ],
      },
      data: {
        executionToken,
        status: SnoozedThreadStatus.EXECUTING,
      },
    });
  });

  it("reclaims an execution after its lease becomes stale", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date("2026-08-16T09:30:00.000Z");

    expect(await markSnoozedThreadAsExecuting("snooze", now)).toEqual(
      expect.any(String),
    );

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            {
              status: SnoozedThreadStatus.EXECUTING,
              updatedAt: { lte: new Date("2026-08-16T09:15:00.000Z") },
            },
          ]),
        }),
      }),
    );
  });

  it("cancels cron-backed work in the database", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });

    expect(await cancelSnoozedThread({ id: "snooze", scheduledId: null })).toBe(
      true,
    );

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: { id: "snooze", status: SnoozedThreadStatus.PENDING },
      data: { status: SnoozedThreadStatus.CANCELLED },
    });
  });

  it("does not cancel work that another worker already claimed", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 0 });

    expect(await cancelSnoozedThread({ id: "snooze", scheduledId: null })).toBe(
      false,
    );
  });

  it("replaces an earlier pending snooze for the same thread", async () => {
    prisma.snoozedThread.findMany.mockResolvedValue([
      { id: "old-snooze", scheduledId: null },
      { id: "duplicate-snooze", scheduledId: null },
    ] as never);
    const preparedRecord = {
      id: "new-snooze",
      scheduledId: null,
    } as never;
    prisma.snoozedThread.create.mockResolvedValue(preparedRecord);
    prisma.snoozedThread.update.mockResolvedValue({
      ...preparedRecord,
      status: SnoozedThreadStatus.PENDING,
    } as never);

    await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
      threadId: "thread",
    });

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account",
        threadId: "thread",
        status: SnoozedThreadStatus.PENDING,
      },
      data: { status: SnoozedThreadStatus.CANCELLED },
    });
  });

  it("keeps the previous snooze active if activating its replacement fails", async () => {
    const preparedRecord = {
      id: "new-snooze",
      scheduledId: null,
    } as never;
    prisma.snoozedThread.findMany.mockResolvedValue([
      { id: "old-snooze", scheduledId: null },
    ] as never);
    prisma.snoozedThread.create.mockResolvedValue(preparedRecord);
    prisma.$transaction.mockRejectedValue(new Error("database unavailable"));

    await expect(
      scheduleSnoozedThread({
        emailAccountId: "account",
        scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
        threadId: "thread",
      }),
    ).rejects.toThrow("database unavailable");

    expect(prisma.snoozedThread.updateMany).toHaveBeenLastCalledWith({
      where: {
        id: "new-snooze",
        status: SnoozedThreadStatus.PREPARING,
      },
      data: {
        schedulingStatus: "FAILED",
        status: SnoozedThreadStatus.FAILED,
      },
    });
  });

  it("releases claimed work for a later retry", async () => {
    await releaseSnoozedThreadForRetry("snooze", "claim-token");

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        executionToken: "claim-token",
        id: "snooze",
        status: SnoozedThreadStatus.EXECUTING,
      },
      data: {
        executionToken: null,
        status: SnoozedThreadStatus.PENDING,
      },
    });
  });
});
