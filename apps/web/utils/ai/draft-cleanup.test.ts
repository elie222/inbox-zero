import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupAIDraftsForAccount,
  cleanupConfiguredAIDraftsForAccount,
  getEmailAccountsWithStaleAIDrafts,
  markTrackedDraftDeleted,
} from "@/utils/ai/draft-cleanup";
import { createTestLogger } from "@/__tests__/helpers";
import { ActionType, DraftEmailStatus } from "@/generated/prisma/enums";

const mocks = vi.hoisted(() => ({
  prisma: {
    emailAccount: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    executedAction: {
      findFirst: vi.fn(),
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

const logger = createTestLogger();

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
          OR: [
            {
              draftStatus: {
                in: [
                  DraftEmailStatus.PENDING,
                  DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
                ],
              },
            },
            { draftStatus: null },
            {
              draftStatus: DraftEmailStatus.CLEANED_UP_UNUSED,
              wasDraftSent: false,
            },
          ],
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
    expect(mocks.prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-2" },
      data: {
        draftStatus: DraftEmailStatus.USER_EDITED,
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

  it("retries legacy cleanup records that still have provider drafts", async () => {
    mocks.prisma.executedAction.findMany.mockResolvedValue([
      {
        id: "action-legacy-cleaned",
        draftId: "draft-legacy-cleaned",
        content: "Legacy generated reply.",
        draftStatus: DraftEmailStatus.CLEANED_UP_UNUSED,
        wasDraftSent: false,
      },
    ]);
    mocks.provider.getDraft.mockResolvedValue({
      textPlain: "Legacy generated reply.",
      textHtml: null,
    });

    const result = await cleanupAIDraftsForAccount({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      cleanupDays: 14,
    });

    expect(mocks.provider.deleteDraft).toHaveBeenCalledWith(
      "draft-legacy-cleaned",
    );
    expect(mocks.prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-legacy-cleaned" },
      data: {
        wasDraftSent: null,
      },
    });
    expect(result).toMatchObject({
      total: 1,
      deleted: 1,
      cleanupDays: 14,
    });
  });

  it("marks legacy cleanup records as checked when the provider draft is gone", async () => {
    mocks.prisma.executedAction.findMany.mockResolvedValue([
      {
        id: "action-legacy-missing",
        draftId: "draft-legacy-missing",
        content: "Legacy generated reply.",
        draftStatus: DraftEmailStatus.CLEANED_UP_UNUSED,
        wasDraftSent: false,
      },
    ]);
    mocks.provider.getDraft.mockResolvedValue(null);

    const result = await cleanupAIDraftsForAccount({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      cleanupDays: 14,
    });

    expect(mocks.provider.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-legacy-missing" },
      data: {
        wasDraftSent: null,
      },
    });
    expect(result).toMatchObject({
      total: 1,
      alreadyGone: 1,
      cleanupDays: 14,
    });
  });
});

describe("markTrackedDraftDeleted", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks the tracked draft as cleaned up", async () => {
    mocks.prisma.executedAction.findFirst.mockResolvedValue({
      id: "action-1",
      draftStatus: DraftEmailStatus.PENDING,
      wasDraftSent: false,
    });

    await markTrackedDraftDeleted({
      draftId: "draft-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(mocks.prisma.executedAction.findFirst).toHaveBeenCalledWith({
      where: {
        draftId: "draft-1",
        executedRule: { emailAccountId: "email-account-1" },
        type: ActionType.DRAFT_EMAIL,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true, draftStatus: true, wasDraftSent: true },
    });
    expect(mocks.prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        draftStatus: DraftEmailStatus.CLEANED_UP_UNUSED,
        wasDraftSent: null,
      },
    });
  });

  it("does nothing when the draft is not tracked", async () => {
    mocks.prisma.executedAction.findFirst.mockResolvedValue(null);

    await markTrackedDraftDeleted({
      draftId: "draft-untracked",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(mocks.prisma.executedAction.update).not.toHaveBeenCalled();
  });

  it("does not overwrite terminal draft statuses", async () => {
    mocks.prisma.executedAction.findFirst.mockResolvedValue({
      id: "action-sent",
      draftStatus: DraftEmailStatus.LIKELY_SENT,
      wasDraftSent: null,
    });

    await markTrackedDraftDeleted({
      draftId: "draft-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(mocks.prisma.executedAction.update).not.toHaveBeenCalled();
  });
});

describe("getEmailAccountsWithStaleAIDrafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("selects connected accounts with cleanup enabled and stale candidate drafts", async () => {
    mocks.prisma.emailAccount.findMany.mockResolvedValue([
      { id: "email-account-1" },
      { id: "email-account-2" },
    ]);

    const result = await getEmailAccountsWithStaleAIDrafts();

    expect(result).toEqual(["email-account-1", "email-account-2"]);
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
                OR: [
                  {
                    draftStatus: {
                      in: [
                        DraftEmailStatus.PENDING,
                        DraftEmailStatus.REPLIED_WITHOUT_DRAFT,
                      ],
                    },
                  },
                  { draftStatus: null },
                  {
                    draftStatus: DraftEmailStatus.CLEANED_UP_UNUSED,
                    wasDraftSent: false,
                  },
                ],
                createdAt: { lt: expect.any(Date) },
              },
            },
          },
        },
      },
      select: { id: true },
    });
  });
});

describe("cleanupConfiguredAIDraftsForAccount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createEmailProvider.mockResolvedValue(mocks.provider);
  });

  it("cleans up with the account's configured window", async () => {
    mocks.prisma.emailAccount.findUnique.mockResolvedValue({
      draftCleanupDays: 30,
      account: { provider: "google", disconnectedAt: null },
    });
    mocks.prisma.executedAction.findMany.mockResolvedValue([]);

    const result = await cleanupConfiguredAIDraftsForAccount({
      emailAccountId: "email-account-1",
      logger,
    });

    expect(result).toMatchObject({ total: 0, cleanupDays: 30 });
  });

  it("skips instead of failing when the account's grant was revoked", async () => {
    mocks.prisma.emailAccount.findUnique.mockResolvedValue({
      draftCleanupDays: 14,
      account: { provider: "google", disconnectedAt: null },
    });
    mocks.prisma.executedAction.findMany.mockResolvedValue([
      { id: "action-1", draftId: "draft-1", content: "Thanks." },
    ]);
    mocks.createEmailProvider.mockRejectedValue(new Error("invalid_grant"));

    const result = await cleanupConfiguredAIDraftsForAccount({
      emailAccountId: "email-account-1",
      logger,
    });

    expect(result).toBeNull();
  });

  it("rethrows unrelated failures", async () => {
    mocks.prisma.emailAccount.findUnique.mockResolvedValue({
      draftCleanupDays: 14,
      account: { provider: "google", disconnectedAt: null },
    });
    mocks.prisma.executedAction.findMany.mockResolvedValue([
      { id: "action-1", draftId: "draft-1", content: "Thanks." },
    ]);
    mocks.createEmailProvider.mockRejectedValue(new Error("boom"));

    await expect(
      cleanupConfiguredAIDraftsForAccount({
        emailAccountId: "email-account-1",
        logger,
      }),
    ).rejects.toThrow("boom");
  });

  it.each([
    [
      "cleanup is turned off",
      {
        draftCleanupDays: null,
        account: { provider: "google", disconnectedAt: null },
      },
    ],
    [
      "the account is disconnected",
      {
        draftCleanupDays: 14,
        account: { provider: "google", disconnectedAt: new Date() },
      },
    ],
  ])("skips when %s", async (_caseName, emailAccount) => {
    mocks.prisma.emailAccount.findUnique.mockResolvedValue(emailAccount);

    const result = await cleanupConfiguredAIDraftsForAccount({
      emailAccountId: "email-account-1",
      logger,
    });

    expect(result).toBeNull();
    expect(mocks.prisma.executedAction.findMany).not.toHaveBeenCalled();
  });
});
