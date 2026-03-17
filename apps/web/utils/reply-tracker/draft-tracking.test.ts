import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { ActionType } from "@/generated/prisma/enums";
import { trackSentDraftStatus } from "./draft-tracking";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/prisma-retry", () => ({
  withPrismaRetry: vi.fn().mockImplementation((fn) => fn()),
}));
vi.mock("@/utils/similarity-score", () => ({
  calculateSimilarity: vi.fn(),
}));
vi.mock("@/utils/ai/reply/reply-memory", () => ({
  isMeaningfulDraftEdit: vi.fn(),
  saveReplyMemoryEvidence: vi.fn().mockResolvedValue(undefined),
  syncReplyMemoriesFromEvidence: vi.fn().mockResolvedValue(undefined),
}));

import { calculateSimilarity } from "@/utils/similarity-score";
import {
  isMeaningfulDraftEdit,
  saveReplyMemoryEvidence,
  syncReplyMemoriesFromEvidence,
} from "@/utils/ai/reply/reply-memory";

const logger = createScopedLogger("draft-tracking-test");

describe("trackSentDraftStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.draftSendLog.create).mockResolvedValue({} as any);
    vi.mocked(prisma.executedAction.update).mockResolvedValue({} as any);
    vi.mocked(prisma.$transaction).mockResolvedValue([] as any);
  });

  it("captures reply memory evidence for meaningful edited sends", async () => {
    vi.mocked(prisma.executedAction.findFirst).mockResolvedValue({
      id: "action-1",
      draftId: "draft-1",
      content: "Thanks for reaching out.",
      executedRule: {
        messageId: "source-1",
      },
    } as any);
    vi.mocked(calculateSimilarity).mockReturnValue(0.52);
    vi.mocked(isMeaningfulDraftEdit).mockReturnValue(true);

    const provider = {
      getDraft: vi.fn().mockResolvedValue(null),
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
    expect(saveReplyMemoryEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        executedActionId: "action-1",
        sourceMessageId: "source-1",
        sentMessageId: "sent-1",
        threadId: "thread-1",
        draftText: "Thanks for reaching out.",
        sentText: "Please include pricing for seat counts.",
        similarityScore: 0.52,
      }),
    );
    expect(syncReplyMemoriesFromEvidence).toHaveBeenCalledWith({
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
      executedRule: {
        messageId: "source-1",
      },
    } as any);
    vi.mocked(calculateSimilarity).mockReturnValue(0.98);
    vi.mocked(isMeaningfulDraftEdit).mockReturnValue(false);

    await trackSentDraftStatus({
      emailAccountId: "account-1",
      message: createSentMessage(),
      provider: {
        getDraft: vi.fn().mockResolvedValue(null),
      } as any,
      logger,
    });

    expect(saveReplyMemoryEvidence).not.toHaveBeenCalled();
    expect(syncReplyMemoriesFromEvidence).not.toHaveBeenCalled();
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
