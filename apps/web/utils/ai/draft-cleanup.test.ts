import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupAIDraftsForAccount,
  cleanupConfiguredAIDrafts,
  markTrackedDraftDeleted,
} from "@/utils/ai/draft-cleanup";
import { createTestLogger } from "@/__tests__/helpers";
import { ActionType, DraftEmailStatus } from "@/generated/prisma/enums";

const mocks = vi.hoisted(() => ({
  prisma: {
    emailAccount: {
      findMany: vi.fn(),
    },
    threadTracker: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    executedAction: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
  provider: {
    getDraft: vi.fn(),
    getDrafts: vi.fn(),
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
    vi.resetAllMocks();
    mocks.prisma.threadTracker.findMany.mockResolvedValue([]);
    mocks.provider.deleteDraft.mockResolvedValue(true);
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
    expect(mocks.prisma.threadTracker.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailAccountId: "email-account-1",
          followUpDraftId: { not: null },
          OR: [
            { followUpDraftCreatedAt: { lt: expectedCutoffDate } },
            {
              followUpDraftCreatedAt: null,
              followUpAppliedAt: { lt: expectedCutoffDate },
            },
          ],
        },
      }),
    );
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

  it("cleans up all tracked follow-up drafts beyond the first 100 mailbox drafts", async () => {
    const content =
      '<p>Checking in. See <a href="https://example.com/details">the details</a>.</p><p>Demo signature</p>';
    const trackers = Array.from({ length: 105 }, (_, index) => ({
      id: `tracker-${index}`,
      followUpDraftId: `follow-up-${index}`,
      followUpDraftContent: content,
    }));
    mocks.prisma.executedAction.findMany.mockResolvedValue([]);
    mocks.prisma.threadTracker.findMany.mockResolvedValue(trackers);
    mocks.provider.getDraft.mockResolvedValue({
      textPlain: "Checking in. See the details. Demo signature",
      textHtml: `${content}<blockquote type="cite">Previous thread message</blockquote>`,
    });

    const result = await cleanupAIDraftsForAccount({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      cleanupDays: 14,
    });

    expect(result).toMatchObject({ total: 105, deleted: 105 });
    expect(mocks.provider.getDrafts).not.toHaveBeenCalled();
    expect(mocks.provider.deleteDraft).toHaveBeenCalledTimes(105);
    expect(mocks.provider.deleteDraft).toHaveBeenCalledWith("follow-up-104");
    expect(mocks.prisma.threadTracker.updateMany).toHaveBeenCalledWith({
      where: { id: "tracker-104", followUpDraftId: "follow-up-104" },
      data: {
        followUpDraftId: null,
        followUpDraftContent: null,
        followUpDraftCreatedAt: null,
      },
    });
    expect(mocks.prisma.threadTracker.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailAccountId: "email-account-1",
          followUpDraftId: { not: null },
          OR: expect.arrayContaining([
            { followUpDraftCreatedAt: { lt: expect.any(Date) } },
          ]),
        }),
      }),
    );
  });

  it("protects edited and unknown-content drafts and continues after provider failures", async () => {
    mocks.prisma.executedAction.findMany.mockResolvedValue([
      { id: "action-unknown", draftId: "rule-unknown", content: null },
    ]);
    mocks.prisma.threadTracker.findMany.mockResolvedValue([
      {
        id: "tracker-edited",
        followUpDraftId: "edited",
        followUpDraftContent: "Checking in.",
      },
      {
        id: "tracker-unknown",
        followUpDraftId: "unknown",
        followUpDraftContent: null,
      },
      {
        id: "tracker-error",
        followUpDraftId: "error",
        followUpDraftContent: "Checking in.",
      },
      {
        id: "tracker-refused",
        followUpDraftId: "refused",
        followUpDraftContent: "Checking in.",
      },
      {
        id: "tracker-empty",
        followUpDraftId: "empty",
        followUpDraftContent: "Checking in.",
      },
      {
        id: "tracker-missing",
        followUpDraftId: "missing",
        followUpDraftContent: "Checking in.",
      },
      {
        id: "tracker-ok",
        followUpDraftId: "ok",
        followUpDraftContent: "Checking in.",
      },
    ]);
    mocks.provider.getDraft.mockImplementation(async (id: string) => {
      if (id === "error") throw new Error("Temporary provider error");
      if (id === "missing") return null;
      let textPlain = "Checking in.";
      if (id === "edited") textPlain = "User's revised reply.";
      if (id === "empty") textPlain = "";
      return { textPlain, textHtml: null };
    });
    mocks.provider.deleteDraft.mockImplementation(
      async (id: string) => id !== "refused",
    );

    const result = await cleanupAIDraftsForAccount({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      cleanupDays: 14,
    });

    expect(result).toMatchObject({
      total: 8,
      deleted: 1,
      skippedModified: 4,
      alreadyGone: 1,
      errors: 2,
    });
    expect(mocks.provider.deleteDraft.mock.calls.map(([id]) => id)).toEqual([
      "refused",
      "ok",
    ]);
    expect(mocks.prisma.executedAction.update).not.toHaveBeenCalled();
    expect(
      mocks.prisma.threadTracker.updateMany.mock.calls.map(
        ([args]) => args.where.id,
      ),
    ).toEqual(["tracker-missing", "tracker-ok"]);
  });

  it.each([
    {
      name: "edited link destination",
      draft: {
        textHtml:
          '<p>See <a href="https://example.com/revised">the details</a>.</p>',
      },
    },
    {
      name: "added attachment",
      draft: {
        textHtml:
          '<p>See <a href="https://example.com/original">the details</a>.</p>',
        hasAttachment: true,
      },
    },
  ])("protects follow-up drafts with an $name", async ({ draft }) => {
    mocks.prisma.executedAction.findMany.mockResolvedValue([]);
    mocks.prisma.threadTracker.findMany.mockResolvedValue([
      {
        id: "tracker-edited",
        followUpDraftId: "follow-up-edited",
        followUpDraftContent:
          '<p>See <a href="https://example.com/original">the details</a>.</p>',
      },
    ]);
    mocks.provider.getDraft.mockResolvedValue(draft);

    const result = await cleanupAIDraftsForAccount({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      cleanupDays: 14,
    });

    expect(result).toMatchObject({ deleted: 0, skippedModified: 1 });
    expect(mocks.provider.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.prisma.threadTracker.updateMany).not.toHaveBeenCalled();
  });

  it("keeps a rule draft retryable when the provider declines deletion", async () => {
    mocks.prisma.executedAction.findMany.mockResolvedValue([
      {
        id: "action-refused",
        draftId: "rule-refused",
        content: "Generated reply.",
      },
    ]);
    mocks.provider.getDraft.mockResolvedValue({
      textPlain: "Generated reply.",
      textHtml: null,
    });
    mocks.provider.deleteDraft.mockResolvedValue(false);

    const result = await cleanupAIDraftsForAccount({
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
      cleanupDays: 14,
    });

    expect(result).toMatchObject({ deleted: 0, errors: 1 });
    expect(mocks.prisma.executedAction.update).not.toHaveBeenCalled();
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

describe("cleanupConfiguredAIDrafts", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.prisma.threadTracker.findMany.mockResolvedValue([]);
    mocks.provider.deleteDraft.mockResolvedValue(true);
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

    mocks.prisma.threadTracker.findMany.mockResolvedValue([
      {
        id: "tracker-cron",
        followUpDraftId: "follow-up-cron",
        followUpDraftContent: "Checking in.",
      },
    ]);
    mocks.provider.getDraft.mockResolvedValue({
      textPlain: "Checking in.",
      textHtml: null,
    });

    const result = await cleanupConfiguredAIDrafts({ logger });

    expect(mocks.prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: {
        draftCleanupDays: { not: null },
        account: { disconnectedAt: null },
        OR: [
          {
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
                  },
                },
              },
            },
          },
          { threadTrackers: { some: { followUpDraftId: { not: null } } } },
        ],
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
      total: 1,
      deleted: 1,
    });
    expect(mocks.provider.deleteDraft).toHaveBeenCalledWith("follow-up-cron");
  });
});
