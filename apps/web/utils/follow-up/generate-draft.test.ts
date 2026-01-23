import { describe, expect, it, vi, beforeEach } from "vitest";
import { generateFollowUpDraft } from "./generate-draft";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("server-only", () => ({}));

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

vi.mock("@/utils/referral/referral-code", () => ({
  getOrCreateReferralCode: vi.fn().mockResolvedValue({ code: "TEST123" }),
}));

vi.mock("@/utils/referral/referral-link", () => ({
  generateReferralLink: vi
    .fn()
    .mockReturnValue("https://getinboxzero.com/?ref=TEST123"),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE: true,
  },
}));

import prisma from "@/utils/prisma";

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
    draftEmail: vi.fn().mockResolvedValue({ draftId: "draft-123" }),
    ...overrides,
  }) as any;

describe("generateFollowUpDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    // Should use external message for drafting (reply to Bob)
    expect(mockProvider.draftEmail).toHaveBeenCalledWith(
      externalMessage,
      expect.objectContaining({
        to: undefined, // No override needed, will reply to external sender
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
      trackerId: "tracker-1",
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(mockProvider.draftEmail).not.toHaveBeenCalled();
  });
});
