import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockPrisma,
  mockCreateEmailProvider,
  mockDeleteEmailMessageStats,
  mockReconcileEmailMessageStatsFromParsedMessage,
} = vi.hoisted(() => ({
  mockPrisma: {
    emailMessage: {
      findMany: vi.fn(),
    },
    emailAccount: {
      findFirst: vi.fn(),
    },
    $queryRaw: vi.fn(),
  },
  mockCreateEmailProvider: vi.fn(),
  mockDeleteEmailMessageStats: vi.fn(),
  mockReconcileEmailMessageStatsFromParsedMessage: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: mockPrisma,
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => mockCreateEmailProvider(...args),
}));

vi.mock("@/utils/email/email-message-stats", () => ({
  deleteEmailMessageStats: (...args: unknown[]) =>
    mockDeleteEmailMessageStats(...args),
  reconcileEmailMessageStatsFromParsedMessage: (...args: unknown[]) =>
    mockReconcileEmailMessageStatsFromParsedMessage(...args),
  shouldExcludeFromEmailMessageStats: (message: { labelIds?: string[] }) =>
    !!message.labelIds?.some((labelId) =>
      ["TRASH", "SPAM", "DRAFT"].includes(labelId),
    ),
}));

import {
  reconcileConfiguredGmailEmailMessageStats,
  reconcileEmailMessageStatsForAccount,
} from "./email-message-stats-reconciliation";

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
  flush: vi.fn(),
  with: vi.fn(),
};

describe("EmailMessage stats reconciliation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    logger.with.mockReturnValue(logger);
    mockDeleteEmailMessageStats.mockResolvedValue(undefined);
    mockReconcileEmailMessageStatsFromParsedMessage.mockResolvedValue(true);
  });

  it("dry-runs Gmail not-found rows without deleting local stats", async () => {
    const provider = createProvider({
      getMessage: vi.fn().mockRejectedValue({ response: { status: 404 } }),
    });
    mockPrisma.emailMessage.findMany.mockResolvedValue([
      { id: "row-1", messageId: "msg-1", threadId: "thread-1" },
    ]);

    const result = await reconcileEmailMessageStatsForAccount({
      emailAccountId: "account-1",
      provider,
      logger,
      dryRun: true,
    });

    expect(result).toMatchObject({
      checked: 1,
      wouldDelete: 1,
      deleted: 0,
      errors: 0,
    });
    expect(result.samples[0]).toMatchObject({
      action: "would-delete-not-found",
      messageId: "msg-1",
    });
    expect(mockDeleteEmailMessageStats).not.toHaveBeenCalled();
  });

  it("deletes local stats when Gmail reports not found", async () => {
    const provider = createProvider({
      getMessage: vi.fn().mockRejectedValue({ response: { status: 404 } }),
    });
    mockPrisma.emailMessage.findMany.mockResolvedValue([
      { id: "row-1", messageId: "msg-1", threadId: "thread-1" },
    ]);

    const result = await reconcileEmailMessageStatsForAccount({
      emailAccountId: "account-1",
      provider,
      logger,
    });

    expect(result).toMatchObject({
      checked: 1,
      deleted: 1,
      deletedNotFound: 1,
      errors: 0,
    });
    expect(mockDeleteEmailMessageStats).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        messageId: "msg-1",
        threadId: "thread-1",
        reason: "stats-reconciliation-message-not-found",
      }),
    );
  });

  it("does not delete local stats for non-Gmail errors that mention not found", async () => {
    const provider = createProvider({
      getMessage: vi.fn().mockRejectedValue(new Error("OAuth token not found")),
    });
    mockPrisma.emailMessage.findMany.mockResolvedValue([
      { id: "row-1", messageId: "msg-1", threadId: "thread-1" },
    ]);

    const result = await reconcileEmailMessageStatsForAccount({
      emailAccountId: "account-1",
      provider,
      logger,
    });

    expect(result).toMatchObject({
      checked: 1,
      deleted: 0,
      errors: 1,
    });
    expect(mockDeleteEmailMessageStats).not.toHaveBeenCalled();
  });

  it("deletes local stats when the current Gmail message is excluded", async () => {
    const provider = createProvider({
      getMessage: vi.fn().mockResolvedValue(
        createMessage({
          id: "msg-1",
          threadId: "thread-1",
          labelIds: ["TRASH"],
        }),
      ),
    });
    mockPrisma.emailMessage.findMany.mockResolvedValue([
      { id: "row-1", messageId: "msg-1", threadId: "thread-1" },
    ]);

    const result = await reconcileEmailMessageStatsForAccount({
      emailAccountId: "account-1",
      provider,
      logger,
    });

    expect(result).toMatchObject({
      deleted: 1,
      deletedExcludedLabel: 1,
      upserted: 0,
    });
    expect(
      mockReconcileEmailMessageStatsFromParsedMessage,
    ).not.toHaveBeenCalled();
    expect(mockDeleteEmailMessageStats).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "stats-reconciliation-excluded-label",
      }),
    );
  });

  it("upserts current Gmail state for kept messages", async () => {
    const message = createMessage({ id: "msg-1", threadId: "thread-1" });
    const provider = createProvider({
      getMessage: vi.fn().mockResolvedValue(message),
    });
    mockPrisma.emailMessage.findMany.mockResolvedValue([
      { id: "row-1", messageId: "msg-1", threadId: "thread-1" },
    ]);

    const result = await reconcileEmailMessageStatsForAccount({
      emailAccountId: "account-1",
      provider,
      logger,
    });

    expect(result).toMatchObject({ upserted: 1, deleted: 0, errors: 0 });
    expect(
      mockReconcileEmailMessageStatsFromParsedMessage,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        message,
        reason: "stats-reconciliation-current-state",
      }),
    );
  });

  it("removes the old local row when Gmail returns a changed thread id", async () => {
    const provider = createProvider({
      getMessage: vi.fn().mockResolvedValue(
        createMessage({
          id: "msg-1",
          threadId: "new-thread",
        }),
      ),
    });
    mockPrisma.emailMessage.findMany.mockResolvedValue([
      { id: "row-1", messageId: "msg-1", threadId: "old-thread" },
    ]);

    const result = await reconcileEmailMessageStatsForAccount({
      emailAccountId: "account-1",
      provider,
      logger,
    });

    expect(result.threadIdChanged).toBe(1);
    expect(mockDeleteEmailMessageStats).toHaveBeenCalledWith(
      expect.objectContaining({
        messageId: "msg-1",
        threadId: "old-thread",
        reason: "stats-reconciliation-thread-id-changed",
      }),
    );
  });

  it("processes only batchSize rows and reports hasMore", async () => {
    const provider = createProvider();
    mockPrisma.emailMessage.findMany.mockResolvedValue([
      { id: "row-1", messageId: "msg-1", threadId: "thread-1" },
      { id: "row-2", messageId: "msg-2", threadId: "thread-2" },
      { id: "row-3", messageId: "msg-3", threadId: "thread-3" },
    ]);

    const result = await reconcileEmailMessageStatsForAccount({
      emailAccountId: "account-1",
      provider,
      logger,
      batchSize: 2,
    });

    expect(mockPrisma.emailMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 3 }),
    );
    expect(provider.getMessage).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ scanned: 2, checked: 2, hasMore: true });
  });

  it("reports hasMore when it stops before processing the fetched batch", async () => {
    const provider = createProvider({
      getMessage: vi.fn().mockRejectedValue(new Error("provider failed")),
    });
    mockPrisma.emailMessage.findMany.mockResolvedValue([
      { id: "row-1", messageId: "msg-1", threadId: "thread-1" },
      { id: "row-2", messageId: "msg-2", threadId: "thread-2" },
    ]);

    const result = await reconcileEmailMessageStatsForAccount({
      emailAccountId: "account-1",
      provider,
      logger,
      batchSize: 2,
      maxErrorsPerAccount: 1,
    });

    expect(result).toMatchObject({
      checked: 1,
      errors: 1,
      stoppedEarly: "max-errors",
      hasMore: true,
    });
  });

  it("continues configured account reconciliation after an account failure", async () => {
    mockPrisma.$queryRaw.mockResolvedValue([
      { id: "account-1", provider: "google", localEmailMessageCount: 1 },
      { id: "account-2", provider: "google", localEmailMessageCount: 1 },
    ]);
    mockPrisma.emailMessage.findMany.mockResolvedValue([
      { id: "row-1", messageId: "msg-1", threadId: "thread-1" },
    ]);
    mockCreateEmailProvider
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockResolvedValueOnce(createProvider());

    const result = await reconcileConfiguredGmailEmailMessageStats({
      logger,
      batchSize: 1,
    });

    expect(result.failedAccounts).toBe(1);
    expect(result.accountsChecked).toBe(1);
    expect(result.totals.upserted).toBe(1);
  });

  it("skips explicit non-Google accounts", async () => {
    mockPrisma.emailAccount.findFirst.mockResolvedValue({
      id: "account-1",
      account: { provider: "microsoft" },
    });

    const result = await reconcileConfiguredGmailEmailMessageStats({
      logger,
      emailAccountId: "account-1",
    });

    expect(result.accountsSkipped).toBe(1);
    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
  });
});

function createProvider(overrides = {}) {
  return {
    name: "google",
    getMessage: vi.fn().mockResolvedValue(createMessage()),
    ...overrides,
  } as never;
}

function createMessage(overrides = {}) {
  return {
    id: "msg-1",
    threadId: "thread-1",
    headers: {
      from: "Sender <sender@example.com>",
      to: "user@example.com",
      subject: "Subject",
    },
    internalDate: Date.now().toString(),
    textHtml: "",
    labelIds: ["INBOX"],
    ...overrides,
  };
}
