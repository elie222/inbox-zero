import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import {
  cancelSnoozedThread,
  markSnoozedThreadAsExecuting,
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
      where: { id: "snooze", status: SnoozedThreadStatus.PENDING },
      data: { status: SnoozedThreadStatus.EXECUTING },
    });
  });

  it("cancels cron-backed work in the database", async () => {
    await cancelSnoozedThread({ id: "snooze", scheduledId: null });

    expect(prisma.snoozedThread.update).toHaveBeenCalledWith({
      where: { id: "snooze" },
      data: { status: SnoozedThreadStatus.CANCELLED },
    });
  });
});
