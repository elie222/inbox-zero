import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  activatePreparedSnoozedThread,
  markSnoozedThreadAsExecuting,
  prepareSnoozedThread,
  releaseSnoozedThreadForRetry,
  scheduleSnoozedThread,
} from "./scheduler";

const { cancelMessages, env, publishJSON } = vi.hoisted(() => ({
  cancelMessages: vi.fn(),
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
    messages = { cancel: cancelMessages };
    publishJSON = publishJSON;
  },
}));

describe("snoozed thread scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.QSTASH_TOKEN = "";
    cancelMessages.mockResolvedValue({ cancelled: 1 });
    prisma.snoozedThread.count.mockResolvedValue(1);
    prisma.snoozedThread.findMany.mockResolvedValue([]);
    prisma.snoozedThread.findUnique.mockResolvedValue(null);
    prisma.$transaction.mockImplementation(async (operations) =>
      Promise.all(operations as Promise<unknown>[]),
    );
  });

  it("persists work for the cron fallback", async () => {
    const scheduledFor = new Date("2026-08-16T09:00:00.000Z");
    const record = { id: "snooze", scheduledFor } as never;
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 0 });
    prisma.snoozedThread.create.mockResolvedValue(record);

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
          {
            status: SnoozedThreadStatus.PENDING,
            scheduledFor: { lte: now },
          },
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

  it("replaces pending snoozes and creates the new restore atomically", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    const replacedSnoozes = [{ id: "old-snooze" }];
    const newSnooze = { id: "new-snooze" } as never;
    prisma.snoozedThread.findMany.mockResolvedValue(replacedSnoozes as never);
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 2 });
    prisma.snoozedThread.create.mockResolvedValue(newSnooze);
    publishJSON.mockResolvedValue({ messageId: "message-id" });
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");

    const result = await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor,
      threadId: "thread",
    });

    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(prisma.snoozedThread.findMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account",
        threadId: "thread",
        status: SnoozedThreadStatus.PENDING,
      },
      select: { id: true },
    });
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
    expect(cancelMessages).toHaveBeenCalledWith({
      filter: { label: ["snoozed-thread-old-snooze"] },
    });
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      cancelMessages.mock.invocationCallOrder[0],
    );
    expect(result).toBe(newSnooze);
  });

  it("creates a non-executable idempotent snooze reservation", async () => {
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");
    const record = {
      id: "snooze",
      clientMutationId: "mutation",
      emailAccountId: "account",
      scheduledFor,
      status: SnoozedThreadStatus.PREPARING,
      threadId: "thread",
    } as never;
    prisma.snoozedThread.create.mockResolvedValue(record);

    await expect(
      prepareSnoozedThread({
        clientMutationId: "mutation",
        emailAccountId: "account",
        scheduledFor,
        threadId: "thread",
      }),
    ).resolves.toEqual({ created: true, snoozedThread: record });

    expect(prisma.snoozedThread.create).toHaveBeenCalledWith({
      data: {
        clientMutationId: "mutation",
        emailAccountId: "account",
        scheduledFor,
        status: SnoozedThreadStatus.PREPARING,
        threadId: "thread",
      },
    });
    expect(publishJSON).not.toHaveBeenCalled();
  });

  it("returns an existing reservation for the same mutation ID", async () => {
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");
    const record = {
      id: "snooze",
      scheduledFor,
      threadId: "thread",
    } as never;
    prisma.snoozedThread.findUnique.mockResolvedValue(record);

    await expect(
      prepareSnoozedThread({
        clientMutationId: "mutation",
        emailAccountId: "account",
        scheduledFor,
        threadId: "thread",
      }),
    ).resolves.toEqual({ created: false, snoozedThread: record });
    expect(prisma.snoozedThread.create).not.toHaveBeenCalled();
  });

  it("activates a prepared snooze only after superseding the previous schedule", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    publishJSON.mockResolvedValue({ messageId: "message-id" });
    const scheduledFor = new Date("2020-08-17T09:00:00.000Z");
    const prepared = {
      id: "snooze",
      clientMutationId: "mutation",
      emailAccountId: "account",
      scheduledFor,
      status: SnoozedThreadStatus.PREPARING,
      threadId: "thread",
    } as never;
    const activated = {
      ...prepared,
      status: SnoozedThreadStatus.PENDING,
    } as never;
    prisma.snoozedThread.findUnique.mockResolvedValue(prepared);
    prisma.snoozedThread.findUniqueOrThrow.mockResolvedValue(activated);
    prisma.snoozedThread.findMany.mockResolvedValue([{ id: "old" }] as never);
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      activatePreparedSnoozedThread({
        clientMutationId: "mutation",
        emailAccountId: "account",
        scheduledFor,
        threadId: "thread",
      }),
    ).resolves.toBe(activated);

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account",
        clientMutationId: "mutation",
        status: SnoozedThreadStatus.PREPARING,
      },
      data: { status: SnoozedThreadStatus.PENDING },
    });
    expect(prisma.snoozedThread.findMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account",
        threadId: "thread",
        status: SnoozedThreadStatus.PENDING,
        OR: [
          { clientMutationId: null },
          { clientMutationId: { not: "mutation" } },
        ],
      },
      select: { id: true },
    });
    expect(prisma.$transaction).toHaveBeenCalledBefore(publishJSON);
  });

  it("retries activation when a concurrent reservation wins the unique index", async () => {
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");
    const prepared = {
      id: "snooze",
      clientMutationId: "mutation",
      emailAccountId: "account",
      scheduledFor,
      status: SnoozedThreadStatus.PREPARING,
      threadId: "thread",
    } as never;
    const activated = {
      ...prepared,
      status: SnoozedThreadStatus.PENDING,
    } as never;
    const conflict = new Prisma.PrismaClientKnownRequestError("conflict", {
      clientVersion: "test",
      code: "P2002",
    });
    prisma.snoozedThread.findUnique.mockResolvedValue(prepared);
    prisma.snoozedThread.findUniqueOrThrow.mockResolvedValue(activated);
    prisma.$transaction
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(async (operations) =>
        Promise.all(operations as Promise<unknown>[]),
      );

    await expect(
      activatePreparedSnoozedThread({
        clientMutationId: "mutation",
        emailAccountId: "account",
        scheduledFor,
        threadId: "thread",
      }),
    ).resolves.toBe(activated);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("releases claimed work for a later retry", async () => {
    const leaseStartedAt = new Date("2026-08-16T09:30:00.000Z");
    const failedAt = new Date("2026-08-16T09:31:00.000Z");

    await releaseSnoozedThreadForRetry("snooze", leaseStartedAt, failedAt);

    expect(prisma.snoozedThread.updateMany).toHaveBeenCalledWith({
      where: {
        id: "snooze",
        status: SnoozedThreadStatus.EXECUTING,
        updatedAt: leaseStartedAt,
      },
      data: {
        scheduledFor: new Date("2026-08-16T09:36:00.000Z"),
        status: SnoozedThreadStatus.PENDING,
      },
    });
  });

  it("publishes precise delivery through QStash", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");
    const record = { id: "snooze", scheduledFor } as never;
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
      label: "snoozed-thread-snooze",
    });
    expect(result).toBe(record);
  });

  it("cancels a published delivery when the snooze was replaced concurrently", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");
    const record = { id: "snooze", scheduledFor } as never;
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 0 });
    prisma.snoozedThread.create.mockResolvedValue(record);
    prisma.snoozedThread.count.mockResolvedValue(0);
    publishJSON.mockResolvedValue({ messageId: "message-id" });

    await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor,
      threadId: "thread",
    });

    expect(cancelMessages).toHaveBeenCalledWith({
      filter: { label: ["snoozed-thread-snooze"] },
    });
  });

  it("publishes the replacement when cancelling the old delivery fails", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");
    const record = { id: "new-snooze", scheduledFor } as never;
    prisma.snoozedThread.findMany.mockResolvedValue([
      { id: "old-snooze" },
    ] as never);
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 1 });
    prisma.snoozedThread.create.mockResolvedValue(record);
    cancelMessages.mockRejectedValue(new Error("offline"));
    publishJSON.mockResolvedValue({ messageId: "message-id" });

    await expect(
      scheduleSnoozedThread({
        emailAccountId: "account",
        scheduledFor,
        threadId: "thread",
      }),
    ).resolves.toBe(record);

    expect(publishJSON).toHaveBeenCalledOnce();
  });

  it("keeps the cron fallback when QStash publishing fails", async () => {
    env.QSTASH_TOKEN = "qstash-token";
    const scheduledFor = new Date("2026-08-17T09:00:00.000Z");
    const record = { id: "snooze", scheduledFor } as never;
    prisma.snoozedThread.updateMany.mockResolvedValue({ count: 0 });
    prisma.snoozedThread.create.mockResolvedValue(record);
    publishJSON.mockRejectedValue(new Error("offline"));

    const result = await scheduleSnoozedThread({
      emailAccountId: "account",
      scheduledFor,
      threadId: "thread",
    });

    expect(publishJSON).toHaveBeenCalledOnce();
    expect(result).toBe(record);
  });
});
