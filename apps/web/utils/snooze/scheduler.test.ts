import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  cancelSnoozedThread,
  markSnoozedThreadAsExecuting,
  releaseSnoozedThreadForRetry,
  scheduleSnoozedThread,
} from "./scheduler";

const { env, publishJSON, qstashRequest } = vi.hoisted(() => ({
  env: {
    CRON_SECRET: "cron-secret",
    INTERNAL_API_URL: "https://inbox-zero.test",
    NEXT_PUBLIC_BASE_URL: "https://inbox-zero.test",
    QSTASH_TOKEN: "",
  },
  publishJSON: vi.fn(),
  qstashRequest: vi.fn(),
}));

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({ env }));
vi.mock("@upstash/qstash", () => ({
  Client: class {
    http = { request: qstashRequest };
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
    const record = { id: "snooze", scheduledId: null } as never;
    prisma.snoozedThread.updateManyAndReturn.mockResolvedValue([]);
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
    expect(prisma.snoozedThread.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account",
        threadId: "thread",
        status: SnoozedThreadStatus.PENDING,
      },
      data: { status: SnoozedThreadStatus.CANCELLED },
      select: { id: true, scheduledId: true },
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
    prisma.snoozedThread.updateManyAndReturn.mockResolvedValue([
      { id: "old-snooze", scheduledId: null },
      { id: "duplicate-snooze", scheduledId: null },
    ] as never);
    prisma.snoozedThread.create.mockResolvedValue({
      id: "new-snooze",
      scheduledId: null,
    } as never);

    const result = await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
      threadId: "thread",
    });

    expect(prisma.snoozedThread.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account",
        threadId: "thread",
        status: SnoozedThreadStatus.PENDING,
      },
      data: { status: SnoozedThreadStatus.CANCELLED },
      select: { id: true, scheduledId: true },
    });
    expect(prisma.snoozedThread.create).toHaveBeenCalledWith({
      data: {
        emailAccountId: "account",
        scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
        threadId: "thread",
      },
    });
    expect(result).toEqual({ id: "new-snooze", scheduledId: null });
  });

  it("replaces existing snoozes and creates the new restore atomically", async () => {
    const cancelledSnoozes = [{ id: "old-snooze", scheduledId: null }] as never;
    const newSnooze = { id: "new-snooze", scheduledId: null } as never;
    prisma.snoozedThread.updateManyAndReturn.mockResolvedValue(
      cancelledSnoozes,
    );
    prisma.snoozedThread.create.mockResolvedValue(newSnooze);

    await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
      threadId: "thread",
    });

    const operations = prisma.$transaction.mock.calls[0]?.[0];
    expect(operations).toHaveLength(2);
    expect(await Promise.all(operations as Promise<unknown>[])).toEqual([
      cancelledSnoozes,
      newSnooze,
    ]);
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

  it("publishes QStash work and persists its delivery ID", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");
    const record = { id: "snooze", scheduledId: null } as never;
    const scheduledRecord = {
      id: "snooze",
      scheduledId: "message-id",
    } as never;
    prisma.snoozedThread.updateManyAndReturn.mockResolvedValue([]);
    prisma.snoozedThread.create.mockResolvedValue(record);
    prisma.snoozedThread.update.mockResolvedValue(scheduledRecord);
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
    expect(prisma.snoozedThread.update).toHaveBeenCalledWith({
      where: { id: "snooze" },
      data: {
        scheduledId: "message-id",
        schedulingStatus: "SCHEDULED",
      },
    });
    expect(result).toBe(scheduledRecord);
  });

  it("keeps cron fallback pending when QStash publishing fails", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    const record = { id: "snooze", scheduledId: null } as never;
    prisma.snoozedThread.updateManyAndReturn.mockResolvedValue([]);
    prisma.snoozedThread.create.mockResolvedValue(record);
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
    publishJSON.mockRejectedValue(new Error("offline"));

    const result = await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
      threadId: "thread",
    });

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: { id: "snooze", status: SnoozedThreadStatus.PENDING },
      data: { schedulingStatus: "FAILED" },
    });
    expect(result).toBe(record);
  });

  it("removes accepted QStash work when its delivery ID cannot be persisted", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    const record = { id: "snooze", scheduledId: null } as never;
    prisma.snoozedThread.updateManyAndReturn.mockResolvedValue([]);
    prisma.snoozedThread.create.mockResolvedValue(record);
    prisma.snoozedThread.update.mockRejectedValue(new Error("offline"));
    publishJSON.mockResolvedValue({ messageId: "message-id" });

    const result = await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor: new Date("2026-08-17T09:00:00.000Z"),
      threadId: "thread",
    });

    expect(qstashRequest).toHaveBeenCalledWith({
      path: ["v2", "messages", "message-id"],
      method: "DELETE",
    });
    expect(result).toBe(record);
  });
});
