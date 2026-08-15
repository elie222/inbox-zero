import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  cancelSnoozedThread,
  markSnoozedThreadAsExecuting,
  releaseSnoozedThreadForRetry,
  scheduleSnoozedThread,
} from "./scheduler";

const { env, publishJSON } = vi.hoisted(() => ({
  env: {
    CRON_SECRET: "cron-secret",
    INTERNAL_API_URL: "https://inbox-zero.test",
    NEXT_PUBLIC_BASE_URL: "https://inbox-zero.test",
    QSTASH_TOKEN: "",
  },
  publishJSON: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({ env }));
vi.mock("@upstash/qstash", () => ({
  Client: class {
    publishJSON = publishJSON;
  },
}));

describe("snoozed thread scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.QSTASH_TOKEN = "";
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Promise<unknown>[]),
    );
  });

  it("persists work for the cron fallback", async () => {
    const record = { id: "snooze" } as never;
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 0 });
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
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it("claims pending work only once", async () => {
    prisma.snoozedThread.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const now = new Date("2026-08-16T09:30:00.000Z");

    expect(await markSnoozedThreadAsExecuting("snooze", now)).toBe(now);
    expect(await markSnoozedThreadAsExecuting("snooze", now)).toBeNull();

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
      data: { status: SnoozedThreadStatus.EXECUTING, updatedAt: now },
    });
  });

  it("reclaims an execution after its lease becomes stale", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
    const now = new Date("2026-08-16T09:30:00.000Z");

    expect(await markSnoozedThreadAsExecuting("snooze", now)).toBe(now);

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

  it("cancels pending work in the database", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });

    expect(await cancelSnoozedThread("snooze")).toBe(true);

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: { id: "snooze", status: SnoozedThreadStatus.PENDING },
      data: { status: SnoozedThreadStatus.CANCELLED },
    });
  });

  it("does not cancel work that another worker already claimed", async () => {
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 0 });

    expect(await cancelSnoozedThread("snooze")).toBe(false);
  });

  it("replaces pending snoozes and creates the new restore atomically", async () => {
    const newSnooze = { id: "new-snooze" } as never;
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 2 });
    prisma.snoozedThread.create.mockResolvedValue(newSnooze);
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");

    const result = await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor,
      threadId: "thread",
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account",
        threadId: "thread",
        status: SnoozedThreadStatus.PENDING,
      },
      data: { status: SnoozedThreadStatus.CANCELLED },
    });
    expect(prisma.snoozedThread.create).toHaveBeenCalledWith({
      data: { emailAccountId: "account", scheduledFor, threadId: "thread" },
    });
    expect(result).toBe(newSnooze);
  });

  it("releases claimed work for a later retry", async () => {
    const leaseStartedAt = new Date("2026-08-16T09:30:00.000Z");

    await releaseSnoozedThreadForRetry("snooze", leaseStartedAt);

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        id: "snooze",
        status: SnoozedThreadStatus.EXECUTING,
        updatedAt: leaseStartedAt,
      },
      data: { status: SnoozedThreadStatus.PENDING },
    });
  });

  it("publishes precise delivery through QStash", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");
    const record = { id: "snooze" } as never;
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 0 });
    prisma.snoozedThread.create.mockResolvedValue(record);
    publishJSON.mockResolvedValue({ messageId: "message-id" });

    const result = await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor,
      threadId: "thread",
    });

    expect(publishJSON).toHaveBeenCalledWith({
      url: "https://inbox-zero.test/api/snoozed-threads/execute",
      body: { snoozedThreadId: "snooze" },
      notBefore: Math.ceil(scheduledFor.getTime() / 1000),
      deduplicationId: "snoozed-thread-snooze",
      contentBasedDeduplication: false,
      headers: new Headers({ authorization: "Bearer cron-secret" }),
    });
    expect(result).toBe(record);
  });

  it("keeps the cron fallback when QStash publishing fails", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    const record = { id: "snooze" } as never;
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 0 });
    prisma.snoozedThread.create.mockResolvedValue(record);
    publishJSON.mockRejectedValue(new Error("offline"));

    const result = await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
      threadId: "thread",
    });

    expect(publishJSON).toHaveBeenCalledOnce();
    expect(result).toBe(record);
  });
});
