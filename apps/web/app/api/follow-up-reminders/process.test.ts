import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  processAccountFollowUps,
  processAllFollowUpReminders,
} from "./process";
import { createScopedLogger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider, EmailLabel } from "@/utils/email/types";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findMany: vi.fn().mockResolvedValue([]),
    },
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

vi.mock("@/utils/email/rate-limit", () => ({
  isProviderRateLimitModeError: vi.fn().mockReturnValue(false),
  getProviderRateLimitDelayMs: vi.fn((options: { error: unknown }) => {
    const err = options.error as Record<string, unknown>;
    const cause = err.cause as Record<string, unknown> | undefined;
    const status = (cause?.status as number) ?? (err.status as number);
    return status === 429 ? 60_000 : null;
  }),
  recordGmailRateLimitFromError: vi.fn().mockResolvedValue(null),
  withRateLimitRecording: vi.fn(async (_context, operation) => operation()),
}));

import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { generateFollowUpDraft } from "@/utils/follow-up/generate-draft";
import { applyFollowUpLabel } from "@/utils/follow-up/labels";
import { getLabelsFromDb } from "@/utils/reply-tracker/label-helpers";

const logger = createScopedLogger("test-follow-up");

const OLD_DATE = "1700000000000"; // Nov 2023 - well past any threshold
const RECENT_DATE = String(Date.now()); // Now - within threshold
const MINUTE_MS = 60_000;

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
  const provider = {
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

  if (!provider.getLatestMessageFromThreadSnapshot) {
    provider.getLatestMessageFromThreadSnapshot = vi.fn(
      async (thread: { id: string }) => {
        return provider.getLatestMessageInThread(thread.id);
      },
    );
  }

  return provider as EmailProvider;
}

function mockMessage(id: string, internalDate: string) {
  const numericInternalDate = Number(internalDate);
  const messageDate = /^\d+$/.test(internalDate)
    ? new Date(numericInternalDate).toISOString()
    : new Date(internalDate).toISOString();

  return {
    id,
    threadId: `thread-${id}`,
    labelIds: [],
    snippet: "",
    historyId: "1",
    internalDate,
    subject: "Test",
    date: messageDate,
    headers: {
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Test",
      date: messageDate,
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
      { threadId: "thread-1", messageId: "msg-1" } as any,
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
      { threadId: "thread-2", messageId: "msg-2" } as any,
    ]);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    expect(applyFollowUpLabel).not.toHaveBeenCalled();
    expect(generateFollowUpDraft).not.toHaveBeenCalled();
  });

  it("does not process stale trackers when thread is no longer labeled", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi.fn().mockResolvedValue([]),
      getLatestMessageInThread: vi.fn(),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    // Stale tracker rows exist, but should not matter because thread labels drive eligibility.
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([
      { threadId: "thread-stale", messageId: "msg-stale" } as any,
    ]);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    expect(prisma.threadTracker.findMany).not.toHaveBeenCalled();
    expect(provider.getLatestMessageInThread).not.toHaveBeenCalled();
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

  it("uses provider snapshot resolver when available", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi.fn().mockResolvedValue([
        {
          id: "thread-inline",
          messages: [mockMessage("msg-inline", OLD_DATE)],
          snippet: "",
        },
      ]),
      getLatestMessageFromThreadSnapshot: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-inline", OLD_DATE)),
      getLatestMessageInThread: vi.fn(),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.threadTracker.create).mockResolvedValue({
      id: "tracker-inline",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    expect(provider.getLatestMessageFromThreadSnapshot).toHaveBeenCalledWith({
      id: "thread-inline",
      messages: [expect.objectContaining({ id: "msg-inline" })],
    });
    expect(provider.getLatestMessageInThread).not.toHaveBeenCalled();
    expect(applyFollowUpLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-inline",
        messageId: "msg-inline",
      }),
    );
  });

  it("uses provider snapshot resolver result for partial payload providers", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi.fn().mockResolvedValue([
        {
          id: "thread-partial",
          messages: [mockMessage("msg-inline-old", "2026-02-20T10:00:00.000Z")],
          snippet: "",
        },
      ]),
      getLatestMessageFromThreadSnapshot: vi
        .fn()
        .mockResolvedValue(
          mockMessage("msg-refetched", "2026-02-20T12:00:00.000Z"),
        ),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.threadTracker.create).mockResolvedValue({
      id: "tracker-refetched",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    expect(provider.getLatestMessageFromThreadSnapshot).toHaveBeenCalledWith({
      id: "thread-partial",
      messages: [expect.objectContaining({ id: "msg-inline-old" })],
    });
    expect(applyFollowUpLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-partial",
        messageId: "msg-refetched",
      }),
    );
  });

  it("processes the same labeled message only once across repeated runs", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([
          { id: "thread-repeat", messages: [], snippet: "" },
        ]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-repeat", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    vi.mocked(prisma.threadTracker.findMany)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { threadId: "thread-repeat", messageId: "msg-repeat" } as any,
      ]);
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.threadTracker.create).mockResolvedValue({
      id: "tracker-repeat",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });
    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    expect(applyFollowUpLabel).toHaveBeenCalledTimes(1);
    expect(generateFollowUpDraft).toHaveBeenCalledTimes(1);
    expect(prisma.threadTracker.create).toHaveBeenCalledTimes(1);
  });

  it("does not create a second draft when duplicate outbound processing resolved the tracker", async () => {
    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([
          { id: "thread-replay", messages: [], snippet: "" },
        ]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-replay", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);

    let findManyCallCount = 0;
    vi.mocked(prisma.threadTracker.findMany).mockImplementation((args: any) => {
      findManyCallCount += 1;
      if (findManyCallCount === 1) return Promise.resolve([]);

      // Simulate outbound replay side effect:
      // the prior tracker exists but is resolved=true.
      // If dedup query filters resolved=false, it will miss this row.
      if (args?.where?.resolved === false) return Promise.resolve([]);
      return Promise.resolve([
        { threadId: "thread-replay", messageId: "msg-replay" } as any,
      ]);
    });

    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.threadTracker.create).mockResolvedValue({
      id: "tracker-replay",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });
    await processAccountFollowUps({
      emailAccount: createMockAccount(),
      logger,
    });

    expect(applyFollowUpLabel).toHaveBeenCalledTimes(1);
    expect(generateFollowUpDraft).toHaveBeenCalledTimes(1);
    expect(prisma.threadTracker.create).toHaveBeenCalledTimes(1);
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

  it("processes threads that fall within the 15-minute eligibility window", async () => {
    const twentyMinutesAgo = String(Date.now() - 20 * MINUTE_MS);

    const provider = createMockProvider({
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([
          { id: "thread-window", messages: [], snippet: "" },
        ]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-window", twentyMinutesAgo)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.threadTracker.create).mockResolvedValue({
      id: "tracker-window",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount({
        followUpAwaitingReplyDays: 30 / (24 * 60),
      }),
      logger,
    });

    expect(applyFollowUpLabel).toHaveBeenCalled();
    expect(generateFollowUpDraft).toHaveBeenCalled();
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

  it("processes TO_REPLY threads when needs-reply follow-up is enabled", async () => {
    const provider = createMockProvider({
      getLabels: vi.fn().mockResolvedValue([
        { id: "awaiting-label", name: "Awaiting Reply" },
        { id: "to-reply-label", name: "To Reply" },
      ] as EmailLabel[]),
      getThreadsWithLabel: vi.fn().mockImplementation(({ labelId }) => {
        if (labelId === "to-reply-label") {
          return Promise.resolve([
            { id: "thread-to-reply", messages: [], snippet: "" },
          ]);
        }
        return Promise.resolve([]);
      }),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-to-reply", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);
    vi.mocked(getLabelsFromDb).mockResolvedValueOnce({
      AWAITING_REPLY: { labelId: "awaiting-label" },
      TO_REPLY: { labelId: "to-reply-label" },
    } as any);
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.threadTracker.create).mockResolvedValue({
      id: "tracker-to-reply",
    } as any);

    await processAccountFollowUps({
      emailAccount: createMockAccount({
        followUpAwaitingReplyDays: null,
        followUpNeedsReplyDays: 3,
      }),
      logger,
    });

    expect(applyFollowUpLabel).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread-to-reply",
        messageId: "msg-to-reply",
      }),
    );
    expect(generateFollowUpDraft).not.toHaveBeenCalled();
  });

  it("does not re-draft when the same message moves between follow-up types", async () => {
    const provider = createMockProvider({
      getLabels: vi.fn().mockResolvedValue([
        { id: "awaiting-label", name: "Awaiting Reply" },
        { id: "to-reply-label", name: "To Reply" },
      ] as EmailLabel[]),
      getThreadsWithLabel: vi
        .fn()
        .mockResolvedValue([
          { id: "thread-shared", messages: [], snippet: "" },
        ]),
      getLatestMessageInThread: vi
        .fn()
        .mockResolvedValue(mockMessage("msg-shared", OLD_DATE)),
    });
    vi.mocked(createEmailProvider).mockResolvedValue(provider);
    vi.mocked(getLabelsFromDb)
      .mockResolvedValueOnce({
        AWAITING_REPLY: { labelId: "awaiting-label" },
        TO_REPLY: { labelId: "to-reply-label" },
      } as any)
      .mockResolvedValueOnce({
        AWAITING_REPLY: { labelId: "awaiting-label" },
        TO_REPLY: { labelId: "to-reply-label" },
      } as any);

    const { Prisma } = await import("@/generated/prisma/client");
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "5.0.0" },
    );

    let rowType: string | null = null;
    vi.mocked(prisma.threadTracker.findMany).mockImplementation((args: any) => {
      const requestedType = args?.where?.type;
      if (!rowType) return Promise.resolve([]);
      if (requestedType && rowType === requestedType) {
        return Promise.resolve([
          { threadId: "thread-shared", messageId: "msg-shared" } as any,
        ]);
      }
      if (!requestedType) {
        return Promise.resolve([
          { threadId: "thread-shared", messageId: "msg-shared" } as any,
        ]);
      }
      return Promise.resolve([]);
    });
    vi.mocked(prisma.threadTracker.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.threadTracker.create).mockImplementation((args: any) => {
      const createType = args?.data?.type;
      if (rowType === null) {
        rowType = createType;
        return Promise.resolve({ id: "tracker-shared" } as any);
      }
      return Promise.reject(duplicateError);
    });
    vi.mocked(prisma.threadTracker.update).mockImplementation((args: any) => {
      rowType = args?.data?.type ?? rowType;
      return Promise.resolve({ id: "tracker-shared" } as any);
    });

    const emailAccount = createMockAccount({
      followUpAwaitingReplyDays: 3,
      followUpNeedsReplyDays: 3,
    });

    await processAccountFollowUps({
      emailAccount,
      logger,
    });
    await processAccountFollowUps({
      emailAccount,
      logger,
    });

    expect(generateFollowUpDraft).toHaveBeenCalledTimes(1);
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
      { threadId: "thread-old", messageId: "msg-old" } as any,
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

    // A different message on this thread was already processed.
    // The new latest message should still be processed once.
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([
      { threadId: "thread-6", messageId: "msg-6-old" } as any,
    ]);
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

describe("processAllFollowUpReminders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts Gmail 429 failures as rate-limited when no retry state is recorded", async () => {
    vi.mocked(prisma.emailAccount.findMany).mockResolvedValue([
      createMockAccount({
        account: { provider: "google" } as any,
      }),
    ] as any);

    vi.mocked(createEmailProvider).mockRejectedValue(
      Object.assign(new Error("Rate limit exceeded"), {
        cause: {
          status: 429,
          message: "Rate limit exceeded",
        },
      }),
    );

    const result = await processAllFollowUpReminders(logger);

    expect(result).toEqual({
      total: 1,
      success: 0,
      errors: 0,
      rateLimited: 1,
    });
  });
});
