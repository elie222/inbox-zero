import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { ActionType } from "@/generated/prisma/enums";
import { cleanupThreadAIDrafts, trackSentDraftStatus } from "./draft-tracking";

vi.mock("@/utils/prisma");
vi.mock("@/utils/prisma-retry", () => ({
  withPrismaRetry: vi.fn().mockImplementation((fn) => fn()),
}));
vi.mock("@/utils/similarity-score", () => ({
  calculateSimilarity: vi.fn(),
}));
vi.mock("@/utils/ai/choose-rule/draft-management", () => ({
  isDraftUnmodified: vi.fn(),
}));
vi.mock("@/utils/ai/reply/reply-memory", () => ({
  isMeaningfulDraftEdit: vi.fn(),
  saveDraftSendLogReplyMemory: vi.fn().mockResolvedValue(undefined),
  syncReplyMemoriesFromDraftSendLogs: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/messaging/rule-notifications", () => ({
  replaceMessagingDraftNotificationsWithHandledOnWebState: vi
    .fn()
    .mockResolvedValue(undefined),
}));

import { calculateSimilarity } from "@/utils/similarity-score";
import { isDraftUnmodified } from "@/utils/ai/choose-rule/draft-management";
import {
  isMeaningfulDraftEdit,
  saveDraftSendLogReplyMemory,
  syncReplyMemoriesFromDraftSendLogs,
} from "@/utils/ai/reply/reply-memory";
import { replaceMessagingDraftNotificationsWithHandledOnWebState } from "@/utils/messaging/rule-notifications";

const logger = createTestLogger();

describe("trackSentDraftStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.draftSendLog.create).mockResolvedValue({
      id: "draft-send-log-1",
    } as any);
    vi.mocked(prisma.executedAction.update).mockResolvedValue({} as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([
      { id: "draft-send-log-1" },
      {},
    ] as any);
  });

  it("queues reply memory learning for meaningful edited sends", async () => {
    vi.mocked(prisma.executedAction.findFirst).mockResolvedValue({
      id: "action-1",
      draftId: "draft-1",
      content: "Thanks for reaching out.",
      executedRuleId: "executed-rule-1",
      executedRule: { messageId: "source-1" },
    } as any);
    vi.mocked(calculateSimilarity).mockReturnValue(0.52);
    vi.mocked(isMeaningfulDraftEdit).mockReturnValue(true);

    const provider = {
      getDraft: vi.fn().mockResolvedValue(null),
      getMessage: vi.fn().mockResolvedValue(createSourceMessage()),
    };

    await trackSentDraftStatus({
      emailAccountId: "account-1",
      message: createSentMessage(),
      provider: provider as any,
      logger,
    });

    expect(prisma.executedAction.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          executedRule: expect.objectContaining({
            emailAccountId: "account-1",
            threadId: "thread-1",
          }),
          type: ActionType.DRAFT_EMAIL,
        }),
      }),
    );
    expect(saveDraftSendLogReplyMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        draftSendLogId: "draft-send-log-1",
        sentText: "Please include pricing for seat counts.",
      }),
    );
    expect(
      replaceMessagingDraftNotificationsWithHandledOnWebState,
    ).toHaveBeenCalledWith({
      executedRuleId: "executed-rule-1",
      logger,
    });
    expect(syncReplyMemoriesFromDraftSendLogs).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      provider,
      logger,
    });
  });

  it("collapses stale messaging draft notifications when the user replies on the web", async () => {
    vi.mocked(prisma.executedAction.findFirst).mockResolvedValue({
      id: "action-1",
      draftId: "draft-1",
      content: "Thanks for reaching out.",
      executedRuleId: "executed-rule-1",
      executedRule: { messageId: "source-1" },
    } as any);
    vi.mocked(calculateSimilarity).mockReturnValue(0.14);

    await trackSentDraftStatus({
      emailAccountId: "account-1",
      message: createSentMessage(),
      provider: {
        getDraft: vi.fn().mockResolvedValue({
          id: "draft-1",
        }),
        getMessage: vi.fn().mockResolvedValue(createSourceMessage()),
      } as any,
      logger,
    });

    expect(
      replaceMessagingDraftNotificationsWithHandledOnWebState,
    ).toHaveBeenCalledWith({
      executedRuleId: "executed-rule-1",
      logger,
    });
    expect(prisma.draftSendLog.create).toHaveBeenCalledWith({
      data: {
        executedActionId: "action-1",
        sentMessageId: "sent-1",
        similarityScore: 0.14,
      },
    });
    expect(prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { wasDraftSent: false },
    });
  });

  it("treats sent messages to someone else as ignored drafts and skips learning", async () => {
    vi.mocked(prisma.executedAction.findFirst).mockResolvedValue({
      id: "action-1",
      draftId: "draft-1",
      content: "Thanks for reaching out.",
      executedRuleId: "executed-rule-1",
      executedRule: { messageId: "source-1" },
    } as any);
    vi.mocked(calculateSimilarity).mockReturnValue(0.08);

    await trackSentDraftStatus({
      emailAccountId: "account-1",
      message: createInternalForwardedSentMessage(),
      provider: {
        getDraft: vi.fn().mockResolvedValue(null),
        getMessage: vi.fn().mockResolvedValue(createSourceMessage()),
      } as any,
      logger,
    });

    expect(prisma.draftSendLog.create).toHaveBeenCalledWith({
      data: {
        executedActionId: "action-1",
        sentMessageId: "sent-internal-forward-1",
        similarityScore: 0.08,
      },
    });
    expect(prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { wasDraftSent: false },
    });
    expect(isMeaningfulDraftEdit).not.toHaveBeenCalled();
    expect(saveDraftSendLogReplyMemory).not.toHaveBeenCalled();
    expect(syncReplyMemoriesFromDraftSendLogs).not.toHaveBeenCalled();
  });

  it("keeps learning from replies with forwarded blocks when sent to the source sender", async () => {
    vi.mocked(prisma.executedAction.findFirst).mockResolvedValue({
      id: "action-1",
      draftId: "draft-1",
      content: "Thanks for reaching out.",
      executedRuleId: "executed-rule-1",
      executedRule: { messageId: "source-1" },
    } as any);
    vi.mocked(calculateSimilarity).mockReturnValue(0.52);
    vi.mocked(isMeaningfulDraftEdit).mockReturnValue(true);

    const provider = {
      getDraft: vi.fn().mockResolvedValue(null),
      getMessage: vi.fn().mockResolvedValue(createSourceMessage()),
    };

    await trackSentDraftStatus({
      emailAccountId: "account-1",
      message: createForwardedReplySentMessage(),
      provider: provider as any,
      logger,
    });

    expect(prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { wasDraftSent: true },
    });
    expect(saveDraftSendLogReplyMemory).toHaveBeenCalledWith(
      expect.objectContaining({
        draftSendLogId: "draft-send-log-1",
        sentText: "Thanks, please use annual billing.",
      }),
    );
    expect(syncReplyMemoriesFromDraftSendLogs).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      provider,
      logger,
    });
  });

  it("skips reply memory learning when the edit is not meaningful", async () => {
    vi.mocked(prisma.executedAction.findFirst).mockResolvedValue({
      id: "action-1",
      draftId: "draft-1",
      content: "Thanks for reaching out.",
      executedRuleId: "executed-rule-1",
      executedRule: { messageId: "source-1" },
    } as any);
    vi.mocked(calculateSimilarity).mockReturnValue(0.98);
    vi.mocked(isMeaningfulDraftEdit).mockReturnValue(false);

    await trackSentDraftStatus({
      emailAccountId: "account-1",
      message: createSentMessage(),
      provider: {
        getDraft: vi.fn().mockResolvedValue(null),
        getMessage: vi.fn().mockResolvedValue(createSourceMessage()),
      } as any,
      logger,
    });

    expect(saveDraftSendLogReplyMemory).not.toHaveBeenCalled();
    expect(syncReplyMemoriesFromDraftSendLogs).not.toHaveBeenCalled();
    expect(
      replaceMessagingDraftNotificationsWithHandledOnWebState,
    ).toHaveBeenCalledWith({
      executedRuleId: "executed-rule-1",
      logger,
    });
  });
});

describe("cleanupThreadAIDrafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.executedAction.update).mockResolvedValue({} as any);
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
  });

  it("deletes stale drafts only when the generated reply is unchanged", async () => {
    const draftDetails = createDraftMessage({
      textPlain: "Generated reply\n\nOn Monday wrote:\n> Quote",
    });
    vi.mocked(prisma.executedAction.findMany).mockResolvedValue([
      {
        id: "action-1",
        draftId: "draft-1",
        content: "Generated reply",
      },
    ] as any);
    vi.mocked(calculateSimilarity).mockReturnValue(0.93);
    vi.mocked(isDraftUnmodified).mockReturnValue(true);

    const provider = {
      getDraft: vi.fn().mockResolvedValue(draftDetails),
      deleteDraft: vi.fn().mockResolvedValue(undefined),
    };

    await cleanupThreadAIDrafts({
      threadId: "thread-1",
      emailAccountId: "account-1",
      provider: provider as any,
      logger,
      excludeMessageId: "message-2",
    });

    expect(isDraftUnmodified).toHaveBeenCalledWith({
      originalContent: "Generated reply",
      currentDraft: draftDetails,
      logger,
    });
    expect(provider.deleteDraft).toHaveBeenCalledWith("draft-1");
    expect(prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: { wasDraftSent: false },
    });
  });

  it("keeps stale drafts when the generated reply was edited", async () => {
    vi.mocked(prisma.executedAction.findMany).mockResolvedValue([
      {
        id: "action-1",
        draftId: "draft-1",
        content: "Generated reply",
      },
    ] as any);
    vi.mocked(calculateSimilarity).mockReturnValue(1);
    vi.mocked(isDraftUnmodified).mockReturnValue(false);

    const provider = {
      getDraft: vi.fn().mockResolvedValue(
        createDraftMessage({
          textPlain: "Generated reply\n\nUser edit",
        }),
      ),
      deleteDraft: vi.fn().mockResolvedValue(undefined),
    };

    await cleanupThreadAIDrafts({
      threadId: "thread-1",
      emailAccountId: "account-1",
      provider: provider as any,
      logger,
      excludeMessageId: "message-2",
    });

    expect(provider.deleteDraft).not.toHaveBeenCalled();
    expect(prisma.executedAction.update).not.toHaveBeenCalled();
  });
});

function createSentMessage(): ParsedMessage {
  return {
    id: "sent-1",
    threadId: "thread-1",
    internalDate: "1710000000000",
    headers: {
      from: "user@example.com",
      to: "sales@example.com",
      subject: "Re: Pricing question",
      date: "2026-03-17T10:10:00.000Z",
      "message-id": "<sent-1@example.com>",
    },
    textPlain: "Please include pricing for seat counts.",
    textHtml: "<p>Please include pricing for seat counts.</p>",
  } as ParsedMessage;
}

function createInternalForwardedSentMessage(): ParsedMessage {
  return {
    ...createSentMessage(),
    id: "sent-internal-forward-1",
    headers: {
      ...createSentMessage().headers,
      to: "teammate@example.com",
      subject: "Fwd: Pricing question",
    },
    textPlain: `Can someone check this?

---------- Forwarded message ----------
From: sales@example.com
Subject: Pricing question

Can you send pricing?`,
    textHtml: undefined,
  } as ParsedMessage;
}

function createForwardedReplySentMessage(): ParsedMessage {
  return {
    ...createSentMessage(),
    id: "sent-forward-reply-1",
    headers: {
      ...createSentMessage().headers,
      subject: "Re: Pricing question",
    },
    textPlain: `Thanks, please use annual billing.

---------- Forwarded message ----------
From: sales@example.com
Subject: Pricing question

Can you send pricing?`,
    textHtml: undefined,
  } as ParsedMessage;
}

function createSourceMessage(): ParsedMessage {
  return {
    id: "source-1",
    threadId: "thread-1",
    internalDate: "1710000000000",
    headers: {
      from: "Sales <sales@example.com>",
      to: "user@example.com",
      subject: "Pricing question",
      date: "2026-03-17T10:00:00.000Z",
      "message-id": "<source-1@example.com>",
    },
    textPlain: "Can you share pricing for a larger team?",
    textHtml: "<p>Can you share pricing for a larger team?</p>",
  } as ParsedMessage;
}

function createDraftMessage({
  textPlain,
  textHtml,
}: {
  textPlain?: string;
  textHtml?: string;
}): ParsedMessage {
  return {
    id: "draft-message-1",
    threadId: "thread-1",
    internalDate: "1710000000000",
    headers: {
      from: "user@example.com",
      to: "sales@example.com",
      subject: "Re: Pricing question",
      date: "2026-03-17T10:10:00.000Z",
      "message-id": "<draft-message-1@example.com>",
    },
    textPlain,
    textHtml,
  } as ParsedMessage;
}
