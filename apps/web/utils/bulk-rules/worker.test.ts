import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { processNextBulkRun } from "./worker";
import { loadThreads } from "@/utils/threads/load";
import { runRulesForMessage } from "@/utils/ai/choose-rule/run-rules-for-message";
import { assertBulkRunAccess } from "./access";
import { SafeError } from "@/utils/error";

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
  retryCount: 0,
  retryAt: null,
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
  prisma.executedRule.findFirst.mockResolvedValue(null);
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
  it("continues past interrupted work without replaying recorded actions", async () => {
    prisma.bulkRuleRunItem.findFirst.mockResolvedValueOnce({
      id: "interrupted",
      attempts: 1,
      messageId: "message",
      updatedAt: new Date(),
    } as never);
    prisma.executedRule.findFirst.mockResolvedValue({
      id: "executed",
    } as never);
    await processNextBulkRun(log);
    expect(runRulesForMessage).not.toHaveBeenCalled();
    expect(prisma.bulkRuleRunItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(
      prisma.bulkRuleRun.updateMany.mock.calls.some(
        ([input]) => input.data.status === "PAUSED",
      ),
    ).toBe(false);
  });

  it("retries interrupted work automatically when no actions were recorded", async () => {
    prisma.bulkRuleRunItem.findFirst.mockResolvedValueOnce({
      id: "interrupted",
      attempts: 1,
      messageId: "message",
      updatedAt: new Date(),
    } as never);
    await processNextBulkRun(log);
    expect(prisma.bulkRuleRunItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING" }),
      }),
    );
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          retryAt: expect.any(Date),
          retryCount: { increment: 1 },
        }),
      }),
    );
    expect(runRulesForMessage).not.toHaveBeenCalled();
  });

  it("retains the failed email for a delayed automatic retry before any action begins", async () => {
    prisma.bulkRuleRun.findFirst.mockResolvedValue({
      ...run,
      scannedAt: new Date(),
    } as never);
    prisma.bulkRuleRunItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "item",
        messageId: "message",
        threadId: "thread",
        attempts: 0,
      } as never);
    vi.mocked(runRulesForMessage).mockRejectedValueOnce(
      new Error("Connection reset"),
    );
    await processNextBulkRun(log);
    expect(prisma.bulkRuleRunItem.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING" }),
      }),
    );
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retryAt: expect.any(Date) }),
      }),
    );
    expect(prisma.bulkRuleRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { OR: [{ retryAt: null }, { retryAt: { lte: expect.any(Date) } }] },
          ]),
        }),
      }),
    );
  });

  it("continues with other emails after repeated failures instead of pausing the run", async () => {
    prisma.bulkRuleRun.findFirst.mockResolvedValue({
      ...run,
      scannedAt: new Date(),
    } as never);
    prisma.bulkRuleRunItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "item",
        messageId: "message",
        threadId: "thread",
        attempts: 2,
      } as never);
    vi.mocked(runRulesForMessage).mockRejectedValueOnce(
      new Error("Bad message"),
    );
    await processNextBulkRun(log);
    expect(prisma.bulkRuleRunItem.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(
      prisma.bulkRuleRun.updateMany.mock.calls.some(
        ([input]) => input.data.status === "PAUSED",
      ),
    ).toBe(false);
  });

  it("does not replay an email when its action may already have been applied", async () => {
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
        attempts: 0,
      } as never);
    prisma.executedRule.findFirst.mockResolvedValue({
      id: "execution",
    } as never);
    vi.mocked(runRulesForMessage).mockRejectedValueOnce(
      new Error("Lost acknowledgement"),
    );
    await processNextBulkRun(log);
    expect(prisma.bulkRuleRunItem.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("pauses for expired credentials while keeping untouched work retryable", async () => {
    prisma.bulkRuleRun.findFirst.mockResolvedValue({
      ...run,
      scannedAt: new Date(),
    } as never);
    prisma.bulkRuleRunItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "item",
        messageId: "message",
        threadId: "thread",
        attempts: 0,
      } as never);
    vi.mocked(runRulesForMessage).mockRejectedValueOnce(
      new SafeError("Reconnect your account", 401),
    );
    await processNextBulkRun(log);
    expect(prisma.bulkRuleRunItem.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING" }),
      }),
    );
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAUSED" }),
      }),
    );
  });

  it("keeps a partially applied email out of the retry queue even for credential errors", async () => {
    prisma.bulkRuleRun.findFirst.mockResolvedValue({
      ...run,
      scannedAt: new Date(),
    } as never);
    prisma.bulkRuleRunItem.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "item",
        messageId: "message",
        threadId: "thread",
        attempts: 0,
      } as never);
    prisma.executedRule.findFirst.mockResolvedValue({
      id: "execution",
    } as never);
    vi.mocked(runRulesForMessage).mockRejectedValueOnce(
      new SafeError("Reconnect your account", 401),
    );
    await processNextBulkRun(log);
    expect(prisma.bulkRuleRunItem.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
  });

  it("retries temporary mailbox scanning failures without losing its cursor", async () => {
    vi.mocked(loadThreads).mockRejectedValueOnce(new Error("Temporary outage"));
    await processNextBulkRun(log);
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retryAt: expect.any(Date) }),
      }),
    );
    expect(
      prisma.bulkRuleRun.updateMany.mock.calls.some(
        ([input]) => "nextPageToken" in input.data,
      ),
    ).toBe(false);
  });

  it("automatically retries a provider quota response even when its HTTP status is 403", async () => {
    vi.mocked(loadThreads).mockRejectedValueOnce(
      Object.assign(new Error("Quota exceeded"), {
        code: 403,
        errors: [{ reason: "quotaExceeded" }],
      }),
    );
    await processNextBulkRun(log);
    expect(prisma.bulkRuleRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ retryAt: expect.any(Date) }),
      }),
    );
    expect(
      prisma.bulkRuleRun.updateMany.mock.calls.some(
        ([input]) => input.data.status === "PAUSED",
      ),
    ).toBe(false);
  });

  it("pauses when the mailbox provider reports invalid credentials", async () => {
    vi.mocked(loadThreads).mockRejectedValueOnce(
      Object.assign(new Error("Unauthorized"), { code: 401 }),
    );
    await processNextBulkRun(log);
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
      new SafeError("access failed"),
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
