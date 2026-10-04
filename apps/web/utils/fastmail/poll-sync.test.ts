import { beforeEach, describe, expect, it, vi } from "vitest";
import { pollAllFastmailAccounts, pollFastmailAccount } from "./poll-sync";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getMockMessage, getEmailAccount } from "@/__tests__/helpers";
import { InvalidMailboxSyncCursorError } from "@/utils/email/mailbox-sync";

const mocks = vi.hoisted(() => ({
  provider: {
    getEmailChanges: vi.fn(),
    getMessagesWithPagination: vi.fn(),
    getMessagesBatch: vi.fn(),
  },
  process: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: async () => mocks.provider,
}));
vi.mock("@/utils/webhook/process-history-item", () => ({
  processHistoryItem: mocks.process,
}));
vi.mock("@/utils/queue/bullmq", () => ({
  enqueueBullmqHttpJob: mocks.enqueue,
}));
vi.mock("@/utils/fastmail/filters", () => ({
  applyFastmailFilters: vi.fn(),
  isManagedFastmailFilter: () => false,
}));
const logger = createScopedLogger("fastmail-sync-test");
const emailAccountId = "account";

beforeEach(() => {
  vi.clearAllMocks();
  prisma.emailAccount.updateMany.mockResolvedValue({ count: 1 });
  prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
    ...getEmailAccount(),
    id: emailAccountId,
    lastSyncedHistoryId: "s1",
    fastmailSyncStartedAt: new Date("2026-10-01"),
    fastmailResyncState: null,
    fastmailResyncPosition: null,
    rules: [],
    user: { id: "user", premium: null },
  } as never);
  prisma.$transaction.mockResolvedValue([]);
  prisma.fastmailSyncItem.findMany.mockResolvedValue([]);
  mocks.provider.getEmailChanges.mockResolvedValue({
    newState: "s2",
    created: ["message"],
    updated: [],
    destroyed: [],
    hasMoreChanges: false,
  });
  mocks.provider.getMessagesBatch.mockResolvedValue([
    getMockMessage({ id: "message" }),
  ]);
  mocks.process.mockResolvedValue(undefined);
});

describe("durable Fastmail synchronization", () => {
  it("does not run concurrently with an active account lease", async () => {
    prisma.emailAccount.updateMany.mockResolvedValueOnce({ count: 0 });
    expect((await pollFastmailAccount({ emailAccountId, logger })).status).toBe(
      "skipped",
    );
    expect(mocks.provider.getEmailChanges).not.toHaveBeenCalled();
  });

  it("stops before side effects if durable intake fails", async () => {
    prisma.$transaction.mockRejectedValueOnce(
      new Error("database unavailable"),
    );
    expect((await pollFastmailAccount({ emailAccountId, logger })).status).toBe(
      "error",
    );
    expect(mocks.process).not.toHaveBeenCalled();
    expect(prisma.emailAccount.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: { fastmailLeaseOwner: null, fastmailLeaseUntil: null },
      }),
    );
  });

  it("keeps failed message work pending for recovery", async () => {
    prisma.fastmailSyncItem.findMany.mockResolvedValue([
      { emailAccountId, messageId: "message" },
    ] as never);
    mocks.process.mockRejectedValueOnce(new Error("temporary failure"));
    expect((await pollFastmailAccount({ emailAccountId, logger })).status).toBe(
      "error",
    );
    expect(prisma.fastmailSyncItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: { increment: 1 } }),
      }),
    );
    expect(
      prisma.fastmailSyncItem.update.mock.calls.some(
        ([args]) => args.data.processedAt,
      ),
    ).toBe(false);
    expect(mocks.process).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ propagateProcessingErrors: true }),
    );
  });

  it("rebuilds expired history from the onboarding boundary", async () => {
    mocks.provider.getEmailChanges
      .mockRejectedValueOnce(new Error("JMAP error: cannotCalculateChanges"))
      .mockResolvedValue({
        newState: "s3",
        created: [],
        updated: [],
        destroyed: [],
        hasMoreChanges: false,
      });
    mocks.provider.getMessagesWithPagination.mockResolvedValue({
      messages: [getMockMessage({ id: "missed" })],
    });
    expect((await pollFastmailAccount({ emailAccountId, logger })).status).toBe(
      "no_changes",
    );
    expect(mocks.provider.getMessagesWithPagination).toHaveBeenCalledWith(
      expect.objectContaining({ after: new Date("2026-10-01") }),
    );
    expect(prisma.fastmailSyncItem.createMany).toHaveBeenCalledWith({
      data: [{ emailAccountId, messageId: "missed" }],
      skipDuplicates: true,
    });
  });

  it("recovers pre-upgrade mail from the previous successful poll", async () => {
    const lastPolledAt = new Date("2026-09-20");
    prisma.emailAccount.findUniqueOrThrow.mockResolvedValueOnce({
      ...getEmailAccount(),
      id: emailAccountId,
      lastSyncedHistoryId: "expired",
      lastPolledAt,
      fastmailSyncStartedAt: null,
      fastmailResyncState: null,
      fastmailResyncPosition: null,
      rules: [],
      user: { id: "user", premium: null },
    } as never);
    mocks.provider.getEmailChanges
      .mockRejectedValueOnce(new Error("JMAP error: cannotCalculateChanges"))
      .mockResolvedValue({
        newState: "s3",
        created: [],
        updated: [],
        destroyed: [],
        hasMoreChanges: false,
      });
    mocks.provider.getMessagesWithPagination.mockResolvedValue({
      messages: [getMockMessage({ id: "pre-upgrade" })],
    });
    await pollFastmailAccount({ emailAccountId, logger });
    expect(mocks.provider.getMessagesWithPagination).toHaveBeenCalledWith(
      expect.objectContaining({ after: lastPolledAt }),
    );
    expect(prisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { fastmailSyncStartedAt: lastPolledAt },
      }),
    );
    expect(prisma.fastmailSyncItem.createMany).toHaveBeenCalledWith({
      data: [{ emailAccountId, messageId: "pre-upgrade" }],
      skipDuplicates: true,
    });
  });

  it("restarts a recovery page if its anchor was deleted", async () => {
    mocks.provider.getEmailChanges
      .mockRejectedValueOnce(new Error("JMAP error: cannotCalculateChanges"))
      .mockResolvedValue({
        newState: "s3",
        created: [],
        updated: [],
        destroyed: [],
        hasMoreChanges: false,
      });
    mocks.provider.getMessagesWithPagination
      .mockRejectedValueOnce(new InvalidMailboxSyncCursorError())
      .mockResolvedValue({ messages: [] });
    expect((await pollFastmailAccount({ emailAccountId, logger })).status).toBe(
      "no_changes",
    );
    expect(mocks.provider.getMessagesWithPagination).toHaveBeenCalledTimes(2);
    expect(prisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { fastmailResyncPosition: null } }),
    );
  });

  it("polls connected accounts even without automation rules", async () => {
    prisma.emailAccount.findMany.mockResolvedValue([
      { id: emailAccountId, email: "person@example.com" },
    ] as never);
    await pollAllFastmailAccounts(logger);
    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: { account: { provider: "fastmail", access_token: { not: null } } },
      select: { id: true, email: true },
    });
    expect(mocks.enqueue).toHaveBeenCalledWith({
      queueName: "fastmail-sync",
      path: "/api/fastmail/process",
      body: { emailAccountId },
    });
  });
});
