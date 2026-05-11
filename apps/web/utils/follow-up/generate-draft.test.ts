import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateFollowUpDraft } from "./generate-draft";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import { aiDraftFollowUp } from "@/utils/ai/reply/draft-follow-up";

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
    NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE: true,
  },
}));

vi.mock("@/utils/ai/reply/draft-follow-up", () => ({
  aiDraftFollowUp: vi.fn().mockResolvedValue("Just checking in on this!"),
}));

vi.mock("@/utils/user/get", () => ({
  getWritingStyle: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(),
    },
    threadTracker: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/utils/prisma-retry", () => ({
  withPrismaRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/utils/referral/referral-code", () => ({
  getOrCreateReferralCode: vi.fn().mockResolvedValue({ code: "TEST123" }),
}));

vi.mock("@/utils/referral/referral-link", () => ({
  generateReferralLink: vi
    .fn()
    .mockReturnValue("https://getinboxzero.com/?ref=TEST123"),
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

import prisma from "@/utils/prisma";
import { createTestLogger } from "@/__tests__/helpers";

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

const createMockEmailAccount = (): EmailAccountWithAI =>
  ({
    id: "test-account-id",
    email: "user@example.com",
    userId: "test-user-id",
    timezone: "UTC",
    about: null,
    multiRuleSelectionEnabled: false,
    calendarBookingLink: null,
    user: {
      aiProvider: "openai",
      aiModel: "gpt-4",
      aiApiKey: null,
    },
    account: {
      provider: "google",
    },
  }) as EmailAccountWithAI;

const createMockMessage = (
  overrides: Partial<ParsedMessage> & {
    headers?: Partial<ParsedMessage["headers"]>;
  } = {},
): ParsedMessage => {
  const { headers: headerOverrides, ...rest } = overrides;
  return {
    id: "msg-1",
    threadId: "thread-1",
    labelIds: ["INBOX"],
    snippet: "Test snippet",
    historyId: "12345",
    internalDate: "1704067200000",
    subject: "Test Subject",
    date: "2024-01-01T00:00:00Z",
    headers: {
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Test Subject",
      date: "2024-01-01T00:00:00Z",
      ...headerOverrides,
    },
    textPlain: "Hello, how are you?",
    textHtml: "<p>Hello, how are you?</p>",
    inline: [],
    ...rest,
  } as ParsedMessage;
};

const createMockProvider = (
  overrides: Partial<Record<keyof EmailProvider, unknown>> = {},
): EmailProvider =>
  ({
    getThread: vi.fn().mockResolvedValue({
      id: "thread-1",
      messages: [],
      snippet: "Test",
    }),
    deleteDraft: vi.fn().mockResolvedValue(undefined),
    draftEmail: vi.fn().mockResolvedValue({ draftId: "draft-123" }),
    ...overrides,
  }) as any;

describe("generateFollowUpDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = false;
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      includeReferralSignature: false,
      signature: null,
    } as any);
    vi.mocked(prisma.threadTracker.update).mockResolvedValue({} as any);
  });

  it("generates draft when external message exists (reply thread scenario)", async () => {
    // Scenario: Bob sends message to User, User replies, waiting for Bob's response
    const externalMessage = createMockMessage({
      id: "external-msg",
      headers: {
        from: "bob@external.com",
        to: "user@example.com",
        subject: "Original Question",
        date: "2024-01-01T00:00:00Z",
      },
    });
    const userMessage = createMockMessage({
      id: "user-msg",
      headers: {
        from: "user@example.com",
        to: "bob@external.com",
        subject: "Re: Original Question",
        date: "2024-01-02T00:00:00Z",
      },
    });

    const mockProvider = createMockProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [externalMessage, userMessage],
        snippet: "Test",
      }),
    });

    await generateFollowUpDraft({
      emailAccount: createMockEmailAccount(),
      threadId: "thread-1",
      messageId: "user-msg",
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    // Should draft from the user's latest sent reply, not the older external email.
    expect(mockProvider.draftEmail).toHaveBeenCalledWith(
      userMessage,
      expect.objectContaining({
        to: "bob@external.com",
        content: expect.any(String),
      }),
      "user@example.com",
      undefined,
    );
  });

  it("generates draft when NO external message exists (user-initiated thread)", async () => {
    // Scenario: User sends initial message to Bob, no reply received
    // This is the bug scenario - previously no draft would be generated
    const userMessage = createMockMessage({
      id: "user-msg",
      headers: {
        from: "user@example.com",
        to: "bob@external.com",
        subject: "Initial Question",
        date: "2024-01-01T00:00:00Z",
      },
    });

    const mockProvider = createMockProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [userMessage], // Only user's message, no external reply
        snippet: "Test",
      }),
    });

    await generateFollowUpDraft({
      emailAccount: createMockEmailAccount(),
      threadId: "thread-1",
      messageId: "user-msg",
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    // Should use user's message with recipient override
    expect(mockProvider.draftEmail).toHaveBeenCalledWith(
      userMessage,
      expect.objectContaining({
        to: "bob@external.com", // Override to send to original recipient
        content: expect.any(String),
      }),
      "user@example.com",
      undefined,
    );
  });

  it("generates draft for multiple user messages without external replies", async () => {
    // Scenario: User sends multiple messages, still no reply
    const userMessage1 = createMockMessage({
      id: "user-msg-1",
      internalDate: "1704067200000", // Earlier
      headers: {
        from: "user@example.com",
        to: "bob@external.com",
        subject: "Initial Question",
        date: "2024-01-01T00:00:00Z",
      },
    });
    const userMessage2 = createMockMessage({
      id: "user-msg-2",
      internalDate: "1704153600000", // Later
      headers: {
        from: "user@example.com",
        to: "bob@external.com",
        subject: "Re: Initial Question",
        date: "2024-01-02T00:00:00Z",
      },
    });

    const mockProvider = createMockProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [userMessage1, userMessage2],
        snippet: "Test",
      }),
    });

    await generateFollowUpDraft({
      emailAccount: createMockEmailAccount(),
      threadId: "thread-1",
      messageId: "user-msg-2",
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    // Should use the LAST user message (most recent)
    expect(mockProvider.draftEmail).toHaveBeenCalledWith(
      userMessage2,
      expect.objectContaining({
        to: "bob@external.com",
      }),
      "user@example.com",
      undefined,
    );
  });

  it("does not generate draft when thread has no messages", async () => {
    const mockProvider = createMockProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [],
        snippet: "",
      }),
    });

    await generateFollowUpDraft({
      emailAccount: createMockEmailAccount(),
      threadId: "thread-1",
      messageId: "msg-1",
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(mockProvider.draftEmail).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Thread has no messages",
      expect.any(Object),
    );
  });

  it("succeeds even when tracker update fails after draft creation", async () => {
    vi.mocked(prisma.threadTracker.update).mockRejectedValue(
      new Error("Record to update not found"),
    );

    const userMessage = createMockMessage({
      id: "user-msg",
      headers: {
        from: "user@example.com",
        to: "bob@external.com",
        subject: "Re: Original Question",
        date: "2024-01-01T00:00:00Z",
      },
    });

    const mockProvider = createMockProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [userMessage],
        snippet: "Test",
      }),
    });

    const logger = createTestLogger();

    // Should NOT throw even though tracker update fails
    await generateFollowUpDraft({
      emailAccount: createMockEmailAccount(),
      threadId: "thread-1",
      messageId: "user-msg",
      trackerId: "tracker-1",
      provider: mockProvider,
      logger,
    });

    // Draft was still created despite tracker update failure
    expect(mockProvider.draftEmail).toHaveBeenCalled();
  });

  it("does not generate draft when thread messages is undefined", async () => {
    const mockProvider = createMockProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: undefined,
        snippet: "",
      }),
    });

    await generateFollowUpDraft({
      emailAccount: createMockEmailAccount(),
      threadId: "thread-1",
      messageId: "msg-1",
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(mockProvider.draftEmail).not.toHaveBeenCalled();
  });

  it("skips draft generation when auto-drafting is disabled", async () => {
    envMock.NEXT_PUBLIC_AUTO_DRAFT_DISABLED = true;

    const userMessage = createMockMessage({
      id: "user-msg",
      headers: {
        from: "user@example.com",
        to: "bob@external.com",
        subject: "Initial Question",
        date: "2024-01-01T00:00:00Z",
      },
    });

    const mockProvider = createMockProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [userMessage],
        snippet: "Test",
      }),
    });

    await generateFollowUpDraft({
      emailAccount: createMockEmailAccount(),
      threadId: "thread-1",
      messageId: "user-msg",
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(aiDraftFollowUp).not.toHaveBeenCalled();
    expect(mockProvider.draftEmail).not.toHaveBeenCalled();
  });

  it("skips draft generation when the tracked message was not sent by the user", async () => {
    const externalMessage = createMockMessage({
      id: "external-msg",
      headers: {
        from: "bob@external.com",
        to: "user@example.com",
        subject: "Original Question",
        date: "2024-01-01T00:00:00Z",
      },
    });

    const mockProvider = createMockProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [externalMessage],
        snippet: "Test",
      }),
    });

    await generateFollowUpDraft({
      emailAccount: createMockEmailAccount(),
      threadId: "thread-1",
      messageId: "external-msg",
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(mockProvider.draftEmail).not.toHaveBeenCalled();
  });

  it("skips draft generation when the tracked message is no longer the latest in the thread", async () => {
    const olderUserMessage = createMockMessage({
      id: "user-msg-1",
      internalDate: "1704067200000",
      headers: {
        from: "user@example.com",
        to: "bob@external.com",
        subject: "Initial Question",
        date: "2024-01-01T00:00:00Z",
      },
    });
    const newerUserMessage = createMockMessage({
      id: "user-msg-2",
      internalDate: "1704153600000",
      headers: {
        from: "user@example.com",
        to: "bob@external.com",
        subject: "Re: Initial Question",
        date: "2024-01-02T00:00:00Z",
      },
    });

    const mockProvider = createMockProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [olderUserMessage, newerUserMessage],
        snippet: "Test",
      }),
    });

    await generateFollowUpDraft({
      emailAccount: createMockEmailAccount(),
      threadId: "thread-1",
      messageId: "user-msg-1",
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(mockProvider.draftEmail).not.toHaveBeenCalled();
  });

  it("sorts thread messages before building LLM context", async () => {
    const olderExternalMessage = createMockMessage({
      id: "external-msg",
      internalDate: "1704067200000",
      headers: {
        from: "bob@external.com",
        to: "user@example.com",
        subject: "Original Question",
        date: "2024-01-01T00:00:00Z",
      },
    });
    const newerUserMessage = createMockMessage({
      id: "user-msg",
      internalDate: "1704153600000",
      headers: {
        from: "user@example.com",
        to: "bob@external.com",
        subject: "Re: Original Question",
        date: "2024-01-02T00:00:00Z",
      },
    });

    const mockProvider = createMockProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-1",
        messages: [newerUserMessage, olderExternalMessage],
        snippet: "Test",
      }),
    });

    await generateFollowUpDraft({
      emailAccount: createMockEmailAccount(),
      threadId: "thread-1",
      messageId: "user-msg",
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(aiDraftFollowUp).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({ id: "external-msg" }),
          expect.objectContaining({ id: "user-msg" }),
        ]),
      }),
    );

    const draftCall = vi.mocked(aiDraftFollowUp).mock.calls.at(-1);
    expect(draftCall?.[0].messages.map((message) => message.id)).toEqual([
      "external-msg",
      "user-msg",
    ]);
  });
});
