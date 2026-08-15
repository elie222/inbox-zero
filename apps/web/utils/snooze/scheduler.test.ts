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
  beforeEach(() => vi.clearAllMocks());

  it("persists work for the cron fallback", async () => {
    const record = { id: "snooze", scheduledId: null } as never;
    prisma.snoozedThread.create.mockResolvedValue(record);
    const scheduledFor = new Date("2026-08-16T09:00:00.000Z");

    const result = await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor,
      threadId: "thread",
    });

    expect(result).toBe(record);
    expect(prisma.snoozedThread.create).toHaveBeenCalledWith({
      data: { emailAccountId: "account", scheduledFor, threadId: "thread" },
    });
  });

  it("claims pending work only once", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
    expect(await markSnoozedThreadAsExecuting("snooze")).toBe(true);

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
      data: { status: SnoozedThreadStatus.EXECUTING },
    });
  });

  it("reclaims an execution after its lease becomes stale", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date("2026-08-16T09:30:00.000Z");

    expect(await markSnoozedThreadAsExecuting("snooze", now)).toBe(true);

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
    prisma.snoozedThread.findFirst.mockResolvedValue({
      id: "old-snooze",
      scheduledId: null,
    } as never);
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
    prisma.snoozedThread.create.mockResolvedValue({
      id: "new-snooze",
    } as never);

    await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
      threadId: "thread",
    });

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        id: "old-snooze",
        status: SnoozedThreadStatus.PENDING,
      },
      data: { status: SnoozedThreadStatus.CANCELLED },
    });
  });

  it("releases claimed work for a later retry", async () => {
    await releaseSnoozedThreadForRetry("snooze");

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: { id: "snooze", status: SnoozedThreadStatus.EXECUTING },
      data: { status: SnoozedThreadStatus.PENDING },
    });
  });
});
