import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { processNextBulkRun } from "./worker";
import { loadThreads } from "@/utils/threads/load";
import { runRulesForMessage } from "@/utils/ai/choose-rule/run-rules-for-message";
import { assertBulkRunAccess } from "./access";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/utils/threads/load", () => ({ loadThreads: vi.fn() }));
vi.mock("@/utils/ai/choose-rule/run-rules-for-message", () => ({
  runRulesForMessage: vi.fn(),
}));
vi.mock("./access", () => ({ assertBulkRunAccess: vi.fn() }));
const log = createScopedLogger("bulk-worker-test");
const run = {
  id: "run",
  emailAccountId: "account",
  status: "QUEUED",
  scannedAt: null,
  nextPageToken: null,
  maxEmails: null,
  startDate: new Date("2026-01-01"),
  endDate: null,
  includeRead: true,
  rerun: false,
  generateDraftReplies: false,
  emailAccount: {
    userId: "owner",
    account: { provider: "google", disconnectedAt: null },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  prisma.bulkRuleRun.findFirst.mockResolvedValue(run as never);
  prisma.bulkRuleRun.findUnique.mockResolvedValue({
    status: "RUNNING",
  } as never);
  prisma.bulkRuleRun.updateMany.mockResolvedValue({ count: 1 });
  prisma.bulkRuleRunItem.findFirst.mockResolvedValue(null);
  prisma.bulkRuleRunItem.count.mockResolvedValue(0);
  prisma.$transaction.mockImplementation(
    async (queries: unknown) =>
      Promise.all(queries as Promise<unknown>[]) as never,
  );
  vi.mocked(loadThreads).mockResolvedValue({
    threads: [],
    nextPageToken: undefined,
  });
  vi.mocked(runRulesForMessage).mockResolvedValue([]);
  vi.mocked(assertBulkRunAccess).mockResolvedValue(undefined);
});
describe("persistent bulk processing", () => {
  it("discovers a page without running rules, retaining its continuation", async () => {
    vi.mocked(loadThreads).mockResolvedValue({
      threads: [
        {
          id: "thread",
          messages: [{ id: "message", headers: { subject: "Example" } }],
          plan: null,
        },
      ],
      nextPageToken: "page-two",
    } as never);
    await processNextBulkRun(log);
    expect(runRulesForMessage).not.toHaveBeenCalled();
    expect(prisma.bulkRuleRunItem.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [
        expect.objectContaining({
          runId: "run",
          threadId: "thread",
          messageId: "message",
          subject: "Example",
        }),
      ],
    });
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextPageToken: "page-two" }),
      }),
    );
  });
  it("keeps date bounds inclusive and enforces the remaining trial allowance", async () => {
    const day = new Date(2026, 0, 2);
    prisma.bulkRuleRun.findFirst.mockResolvedValue({
      ...run,
      startDate: day,
      endDate: day,
      maxEmails: 200,
    } as never);
    prisma.bulkRuleRunItem.count.mockResolvedValue(199);
    vi.mocked(loadThreads).mockResolvedValue({
      threads: [
        {
          id: "already-done",
          messages: [{ id: "old", headers: {} }],
          plan: { id: "applied" },
        },
        { id: "new-one", messages: [{ id: "one", headers: {} }] },
        { id: "new-two", messages: [{ id: "two", headers: {} }] },
      ],
      nextPageToken: "more",
    } as never);
    await processNextBulkRun(log);
    expect(loadThreads).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          after: day,
          before: new Date(2026, 0, 3),
          isUnread: false,
        }),
      }),
    );
    expect(prisma.bulkRuleRunItem.createMany).toHaveBeenCalledWith({
      skipDuplicates: true,
      data: [expect.objectContaining({ threadId: "new-one" })],
    });
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ scannedAt: expect.any(Date) }),
      }),
    );
  });
  it("does not dispatch when another worker holds the lease", async () => {
    prisma.bulkRuleRun.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });
    expect(await processNextBulkRun(log)).toEqual({ worked: false });
    expect(loadThreads).not.toHaveBeenCalled();
    expect(runRulesForMessage).not.toHaveBeenCalled();
  });
  it("does not start another email after the user pauses", async () => {
    prisma.bulkRuleRun.findUnique.mockResolvedValue({
      status: "PAUSED",
    } as never);
    await processNextBulkRun(log);
    expect(loadThreads).not.toHaveBeenCalled();
    expect(runRulesForMessage).not.toHaveBeenCalled();
  });
  it("pauses interrupted work without automatically replaying uncertain actions", async () => {
    prisma.bulkRuleRunItem.findFirst.mockResolvedValueOnce({
      id: "interrupted",
    } as never);
    await processNextBulkRun(log);
    expect(runRulesForMessage).not.toHaveBeenCalled();
    expect(prisma.bulkRuleRunItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAUSED" }),
      }),
    );
  });
  it("honors draft and rerun settings, and skips mail moved out of Inbox", async () => {
    prisma.bulkRuleRun.findFirst.mockResolvedValue({
      ...run,
      scannedAt: new Date(),
      rerun: true,
    } as never);
    prisma.bulkRuleRunItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "item",
        messageId: "message",
        threadId: "thread",
      } as never);
    await processNextBulkRun(log);
    expect(runRulesForMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        rerun: true,
        skipDraftReplies: true,
        requireInbox: true,
        messageId: "message",
      }),
    );
    expect(prisma.bulkRuleRunItem.update).toHaveBeenLastCalledWith({
      where: { id: "item" },
      data: { status: "SKIPPED", ruleNames: [] },
    });
  });
  it("pauses on access or scanning errors instead of reporting completion", async () => {
    vi.mocked(assertBulkRunAccess).mockRejectedValueOnce(
      new Error("access failed"),
    );
    await processNextBulkRun(log);
    expect(runRulesForMessage).not.toHaveBeenCalled();
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PAUSED",
          error: expect.any(String),
        }),
      }),
    );
  });
});
