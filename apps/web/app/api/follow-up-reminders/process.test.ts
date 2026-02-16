import { describe, expect, it, vi, beforeEach } from "vitest";
import { processAccountFollowUps } from "./process";
import { createScopedLogger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider, EmailLabel } from "@/utils/email/types";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    threadTracker: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "tracker-1" }),
      update: vi.fn().mockResolvedValue({ id: "tracker-1" }),
    },
  },
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));

vi.mock("@/utils/follow-up/labels", () => ({
  getOrCreateFollowUpLabel: vi
    .fn()
    .mockResolvedValue({ id: "follow-up-label", name: "Follow Up" }),
  applyFollowUpLabel: vi.fn(),
}));

vi.mock("@/utils/follow-up/generate-draft", () => ({
  generateFollowUpDraft: vi.fn(),
}));

vi.mock("@/utils/reply-tracker/label-helpers", () => ({
  getLabelsFromDb: vi.fn().mockResolvedValue({
    AWAITING_REPLY: { labelId: "awaiting-label" },
    TO_REPLY: null,
  }),
}));

vi.mock("@/utils/rule/consts", () => ({
  getRuleLabel: vi.fn().mockReturnValue("Awaiting Reply"),
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { generateFollowUpDraft } from "@/utils/follow-up/generate-draft";
import { applyFollowUpLabel } from "@/utils/follow-up/labels";

const logger = createScopedLogger("test-follow-up");

const OLD_DATE = "1700000000000"; // Nov 2023 - well past any threshold
const RECENT_DATE = String(Date.now()); // Now - within threshold

function createMockAccount(
  overrides?: Partial<
    EmailAccountWithAI & {
      followUpAwaitingReplyDays: number | null;
      followUpNeedsReplyDays: number | null;
      followUpAutoDraftEnabled: boolean;
    }
  >,
) {
  return {
    id: "account-1",
    email: "user@example.com",
    userId: "user-1",
    about: null,
    timezone: "UTC",
    multiRuleSelectionEnabled: false,
    calendarBookingLink: null,
    followUpAwaitingReplyDays: 3,
    followUpNeedsReplyDays: null,
    followUpAutoDraftEnabled: true,
    user: { aiProvider: null, aiModel: null, aiApiKey: null },
    account: { provider: "microsoft" },
    ...overrides,
  } as any;
}

function createMockProvider(
  overrides?: Partial<Record<string, unknown>>,
): EmailProvider {
  return {
    getLabels: vi
      .fn()
      .mockResolvedValue([
        { id: "awaiting-label", name: "Awaiting Reply" },
      ] as EmailLabel[]),
    getThreadsWithLabel: vi.fn().mockResolvedValue([]),
    getLatestMessageInThread: vi.fn(),
    labelMessage: vi.fn(),
    ...overrides,
  } as any;
}

function mockMessage(id: string, internalDate: string) {
  return {
    id,
    threadId: `thread-${id}`,
    labelIds: [],
    snippet: "",
    historyId: "1",
    internalDate,
    subject: "Test",
    date: new Date(Number(internalDate)).toISOString(),
    headers: {
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Test",
      date: new Date(Number(internalDate)).toISOString(),
    },
    textPlain: "",
    textHtml: "",
    inline: [],
  };
}

describe("processAccountFollowUps - dedup logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips threads with existing unresolved tracker that has followUpAppliedAt", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([{ id: "thread-1", messages: [], snippet: "" }]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-1", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    // Existing tracker with followUpAppliedAt set
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([
      { threadId: "thread-1" } as any,
    ]);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    expect(applyFollowUpLabel).not.toHaveBeenCalled();
    expect(generateFollowUpDraft).not.toHaveBeenCalled();
  });

  it("skips threads with existing unresolved tracker that has followUpDraftId", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([{ id: "thread-2", messages: [], snippet: "" }]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-2", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    // Existing tracker with followUpDraftId set (dedup via draft existence)
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([
      { threadId: "thread-2" } as any,
    ]);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    expect(applyFollowUpLabel).not.toHaveBeenCalled();
    expect(generateFollowUpDraft).not.toHaveBeenCalled();
  });

  it("processes new threads with no existing tracker", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([{ id: "thread-3", messages: [], snippet: "" }]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-3", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    // No existing trackers
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.threadTracker.create).mockResolvedValue({
      id: "tracker-new",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    expect(applyFollowUpLabel).toHaveBeenCalled();
    expect(prisma.threadTracker.create).toHaveBeenCalled();
    expect(generateFollowUpDraft).toHaveBeenCalled();
  });

  it("skips threads where latest message is newer than threshold", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([{ id: "thread-4", messages: [], snippet: "" }]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-4", RECENT_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    // Thread found but skipped because message is too recent
    expect(applyFollowUpLabel).not.toHaveBeenCalled();
    expect(generateFollowUpDraft).not.toHaveBeenCalled();
  });

  it("does not generate drafts when followUpAutoDraftEnabled is false", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([{ id: "thread-5", messages: [], snippet: "" }]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-5", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.threadTracker.create).mockResolvedValue({
      id: "tracker-5",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount({ followUpAutoDraftEnabled: false }),
      logger,
    });

    expect(applyFollowUpLabel).toHaveBeenCalled();
    expect(prisma.threadTracker.create).toHaveBeenCalled();
    expect(generateFollowUpDraft).not.toHaveBeenCalled();
  });

  it("processes multiple threads but skips already-processed ones", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi.fn().mockResolvedValue([
        { id: "thread-old", messages: [], snippet: "" },
        { id: "thread-new", messages: [], snippet: "" },
      ]),
      getLatestMessageInThread: vi.fn().mockImplementation((threadId) => {
        const msgId = threadId === "thread-old" ? "msg-old" : "msg-new";
        return Promise.resolve(mockMessage(msgId, OLD_DATE));
      }),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    // Only thread-old has existing tracker
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([
      { threadId: "thread-old" } as any,
    ]);
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.threadTracker.create).mockResolvedValue({
      id: "tracker-new",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    // Only thread-new should be processed
    expect(applyFollowUpLabel).toHaveBeenCalledTimes(1);
    expect(generateFollowUpDraft).toHaveBeenCalledTimes(1);
  });

  it("updates existing tracker instead of creating a new one", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([{ id: "thread-6", messages: [], snippet: "" }]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-6-new", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    // No batch dedup hit (simulates cleared followUpAppliedAt)
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
    // But findFirst finds an existing unresolved tracker for this thread
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue({
      id: "existing-tracker",
      threadId: "thread-6",
      messageId: "msg-6-old",
    } as any);
    vi.mocked(prisma.threadTracker.update).mockResolvedValue({
      id: "existing-tracker",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    // Should update the existing tracker, not create a new one
    expect(prisma.threadTracker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-tracker" },
        data: expect.objectContaining({
          messageId: "msg-6-new",
          sentAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.threadTracker.create).not.toHaveBeenCalled();
    expect(generateFollowUpDraft).toHaveBeenCalled();
  });

  it("falls back when updating existing tracker hits duplicate key conflict", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([{ id: "thread-7", messages: [], snippet: "" }]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-7-new", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue({
      id: "existing-tracker",
      threadId: "thread-7",
      messageId: "msg-7-old",
    } as any);

    const { Prisma } = await import("@/generated/prisma/client");
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "5.0.0" },
    );
    vi.mocked(prisma.threadTracker.update)
      .mockRejectedValueOnce(duplicateError)
      .mockResolvedValueOnce({
        id: "tracker-7-conflict-row",
      } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    expect(prisma.threadTracker.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: "existing-tracker" },
      }),
    );
    expect(prisma.threadTracker.update).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          emailAccountId_threadId_messageId: expect.objectContaining({
            emailAccountId: "account-1",
            threadId: "thread-7",
            messageId: "msg-7-new",
          }),
        },
        data: expect.objectContaining({ resolved: false }),
      }),
    );
    expect(generateFollowUpDraft).toHaveBeenCalledWith(
      expect.objectContaining({ trackerId: "tracker-7-conflict-row" }),
    );
  });

  it("falls back to update on duplicate key conflict during create", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([{ id: "thread-7", messages: [], snippet: "" }]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-7", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);

    // Simulate concurrent create hitting unique constraint
    const { Prisma } = await import("@/generated/prisma/client");
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "5.0.0" },
    );
    vi.mocked(prisma.threadTracker.create).mockRejectedValue(duplicateError);
    vi.mocked(prisma.threadTracker.update).mockResolvedValue({
      id: "tracker-7",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    // Should fall back to update after duplicate error
    expect(prisma.threadTracker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailAccountId_threadId_messageId: expect.objectContaining({
            emailAccountId: "account-1",
            threadId: "thread-7",
            messageId: "msg-7",
          }),
        },
        data: expect.objectContaining({ resolved: false }),
      }),
    );
    expect(generateFollowUpDraft).toHaveBeenCalled();
  });
});
