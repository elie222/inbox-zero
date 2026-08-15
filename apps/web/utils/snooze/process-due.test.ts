import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import prisma from "@/utils/__mocks__/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { executeSnoozedThread } from "@/utils/snooze/executor";
import { markSnoozedThreadAsExecuting } from "@/utils/snooze/scheduler";
import { processDueSnoozedThreads } from "./process-due";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/snooze/executor", () => ({
  executeSnoozedThread: vi.fn(),
}));
vi.mock("@/utils/snooze/scheduler", () => ({
  markSnoozedThreadAsExecuting: vi.fn(),
}));

const logger = createTestLogger();

describe("processDueSnoozedThreads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(markSnoozedThreadAsExecuting).mockResolvedValue(true);
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
    expect(executeSnoozedThread).toHaveBeenCalledOnce();
  });

  it("fails records whose email provider no longer exists", async () => {
    prisma.snoozedThread.findMany.mockResolvedValue([
      {
        id: "snooze",
        emailAccountId: "account",
        emailAccount: null,
      },
    ] as never);

    const result = await processDueSnoozedThreads(logger);

    expect(result).toEqual({ processed: 0, failed: 1, skipped: 0, total: 1 });
    expect(prisma.snoozedThread.update).toHaveBeenCalledWith({
      where: { id: "snooze" },
      data: { status: SnoozedThreadStatus.FAILED },
    });
  });
});
