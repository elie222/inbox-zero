import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupAIDraftsForAccount,
  cleanupConfiguredAIDrafts,
} from "@/utils/ai/draft-cleanup";
import { ActionType, DraftEmailStatus } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";

const mocks = vi.hoisted(() => ({
  prisma: {
    emailAccount: {
      findMany: vi.fn(),
    },
    executedAction: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  provider: {
    getDraft: vi.fn(),
    deleteDraft: vi.fn(),
  },
  createEmailProvider: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: mocks.prisma,
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mocks.createEmailProvider,
}));

const logger = {
  info: vi.fn(),
  error: vi.fn(),
  trace: vi.fn(),
} as unknown as Logger;

describe("cleanupAIDraftsForAccount", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.createEmailProvider.mockResolvedValue(mocks.provider);
  });

  it("uses the provided cleanup window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-07T12:00:00.000Z"));
    const expectedCutoffDate = new Date();
    expectedCutoffDate.setDate(expectedCutoffDate.getDate() - 14);

    mocks.prisma.executedAction.findMany.mockResolvedValue([]);

    const result = await cleanupAIDraftsForAccount({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      cleanupDays: 14,
    });

    expect(mocks.prisma.executedAction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          executedRule: { emailAccountId: "email-account-1" },
          createdAt: { lt: expectedCutoffDate },
        }),
      }),
    );
    expect(result).toMatchObject({
      total: 0,
      deleted: 0,
      cleanupDays: 14,
    });
    expect(mocks.createEmailProvider).not.toHaveBeenCalled();
  });

  it("deletes only unmodified tracked AI drafts", async () => {
    mocks.prisma.executedAction.findMany.mockResolvedValue([
      {
        id: "action-1",
        draftId: "draft-1",
        content: "Thanks for the note.",
      },
      {
        id: "action-2",
        draftId: "draft-2",
        content: "I'll review this today.",
      },
    ]);
    mocks.provider.getDraft
      .mockResolvedValueOnce({
        textPlain:
          "Thanks for the note.\n\nOn Thu, Sender <sender@example.com> wrote:",
        textHtml: null,
      })
      .mockResolvedValueOnce({
        textPlain: "I changed this draft.",
        textHtml: null,
      });

    const result = await cleanupAIDraftsForAccount({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      cleanupDays: 14,
    });

    expect(mocks.provider.deleteDraft).toHaveBeenCalledWith("draft-1");
    expect(mocks.provider.deleteDraft).not.toHaveBeenCalledWith("draft-2");
    expect(mocks.prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        draftStatus: DraftEmailStatus.CLEANED_UP_UNUSED,
      },
    });
    expect(result).toMatchObject({
      total: 2,
      deleted: 1,
      skippedModified: 1,
      cleanupDays: 14,
    });
  });

  it("transitions replied-without-draft records after cleanup", async () => {
    mocks.prisma.executedAction.findMany.mockResolvedValue([
      {
        id: "action-deleted",
        draftId: "draft-deleted",
        content: "Generated reply.",
        draftStatus: DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
        draftSendLog: { id: "draft-send-log-1" },
      },
      {
        id: "action-missing",
        draftId: "draft-missing",
        content: "Missing reply.",
        draftStatus: DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
        draftSendLog: { id: "draft-send-log-2" },
      },
    ]);
    mocks.provider.getDraft
      .mockResolvedValueOnce({
        textPlain: "Generated reply.",
        textHtml: null,
      })
      .mockResolvedValueOnce(null);

    const result = await cleanupAIDraftsForAccount({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      cleanupDays: 14,
    });

    expect(mocks.provider.deleteDraft).toHaveBeenCalledWith("draft-deleted");
    expect(mocks.prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-deleted" },
      data: {
        draftStatus: DraftEmailStatus.CLEANED_UP_UNUSED,
      },
    });
    expect(mocks.prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-missing" },
      data: {
        draftStatus: DraftEmailStatus.MISSING_FROM_PROVIDER,
      },
    });
    expect(result).toMatchObject({
      total: 2,
      deleted: 1,
      alreadyGone: 1,
      cleanupDays: 14,
    });
  });
});

describe("cleanupConfiguredAIDrafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createEmailProvider.mockResolvedValue(mocks.provider);
  });

  it("runs cleanup for accounts with automatic draft cleanup enabled", async () => {
    mocks.prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "email-account-1",
        draftCleanupDays: 14,
        account: { provider: "google" },
      },
    ]);
    mocks.prisma.executedAction.findMany.mockResolvedValue([]);

    const result = await cleanupConfiguredAIDrafts({ logger });

    expect(mocks.prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: {
        draftCleanupDays: { not: null },
        account: { disconnectedAt: null },
        executedRules: {
          some: {
            actionItems: {
              some: {
                type: ActionType.DRAFT_EMAIL,
                draftId: { not: null },
                draftStatus: {
                  in: [
                    DraftEmailStatus.PENDING,
                    DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
                  ],
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        draftCleanupDays: true,
        account: { select: { provider: true } },
      },
    });
    expect(result).toMatchObject({
      accountsChecked: 1,
      failedAccounts: 0,
      total: 0,
      deleted: 0,
    });
  });
});
