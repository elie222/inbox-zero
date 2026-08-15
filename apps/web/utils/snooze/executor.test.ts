import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import prisma from "@/utils/__mocks__/prisma";
import { executeSnoozedThread } from "./executor";

vi.mock("@/utils/prisma");

const logger = createTestLogger();
const snoozedThread = {
  id: "snooze",
  threadId: "thread",
} as never;

describe("executeSnoozedThread", () => {
  beforeEach(() => vi.clearAllMocks());

  it("restores the thread and completes the snooze", async () => {
    const provider = createMockEmailProvider();

    const result = await executeSnoozedThread(snoozedThread, provider, logger);

    expect(result.success).toBe(true);
    expect(provider.unarchiveThread).toHaveBeenCalledWith("thread");
    expect(prisma.snoozedThread.update).toHaveBeenCalledWith({
      where: { id: "snooze" },
      data: {
        executedAt: expect.any(Date),
        status: SnoozedThreadStatus.COMPLETED,
      },
    });
  });

  it("records a failed provider restoration", async () => {
    const provider = createMockEmailProvider({
      unarchiveThread: vi.fn().mockRejectedValue(new Error("offline")),
    });

    const result = await executeSnoozedThread(snoozedThread, provider, logger);

    expect(result.success).toBe(false);
    expect(prisma.snoozedThread.update).toHaveBeenCalledWith({
      where: { id: "snooze" },
      data: { status: SnoozedThreadStatus.FAILED },
    });
  });
});
