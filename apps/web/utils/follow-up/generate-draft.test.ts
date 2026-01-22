import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateFollowUpDraft } from "./generate-draft";
import {
  createMockEmailProvider,
  getMockParsedMessage,
} from "@/__tests__/mocks/email-provider.mock";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/ai/reply/draft-follow-up", () => ({
  aiDraftFollowUp: vi.fn().mockResolvedValue("Just checking in on this!"),
}));
vi.mock("@/utils/user/get", () => ({
  getWritingStyle: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/utils/referral/referral-code", () => ({
  getOrCreateReferralCode: vi.fn().mockResolvedValue({ code: "test-code" }),
}));
vi.mock("@/utils/referral/referral-link", () => ({
  generateReferralLink: vi.fn().mockReturnValue("https://test.com/ref"),
}));
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE: true,
  },
}));

const logger = createScopedLogger("test");

describe("generateFollowUpDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue({
      includeReferralSignature: false,
      signature: null,
    });
  });

  const mockEmailAccount = {
    id: "account-123",
    email: "user@test.com",
    userId: "user-123",
    about: null,
    multiRuleSelectionEnabled: false,
    timezone: null,
    calendarBookingLink: null,
    user: {
      aiProvider: null,
      aiModel: null,
      aiApiKey: null,
    },
    account: {
      provider: "google" as const,
    },
  };

  it("generates draft when external message exists (reply thread scenario)", async () => {
    // Scenario: Bob sends message to User, User replies, waiting for Bob's response
    const externalMessage = getMockParsedMessage({
      id: "external-msg",
      headers: {
        from: "bob@external.com",
        to: "user@test.com",
        subject: "Original Question",
        date: "2024-01-01T00:00:00Z",
      },
    });
    const userMessage = getMockParsedMessage({
      id: "user-msg",
      headers: {
        from: "user@test.com",
        to: "bob@external.com",
        subject: "Re: Original Question",
        date: "2024-01-02T00:00:00Z",
      },
    });

    const mockProvider = createMockEmailProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-123",
        messages: [externalMessage, userMessage],
        snippet: "Test",
      }),
      draftEmail: vi.fn().mockResolvedValue({ draftId: "draft-123" }),
    });

    await generateFollowUpDraft({
      emailAccount: mockEmailAccount,
      threadId: "thread-123",
      provider: mockProvider,
      logger,
    });

    // Should use external message for drafting (reply to Bob)
    expect(mockProvider.draftEmail).toHaveBeenCalledWith(
      externalMessage,
      expect.objectContaining({
        to: undefined, // No override needed, will reply to external sender
        content: expect.any(String),
      }),
      "user@test.com",
      undefined,
    );
  });

  it("generates draft when NO external message exists (user-initiated thread)", async () => {
    // Scenario: User sends initial message to Bob, no reply received
    // This is the bug scenario - previously no draft would be generated
    const userMessage = getMockParsedMessage({
      id: "user-msg",
      headers: {
        from: "user@test.com",
        to: "bob@external.com",
        subject: "Initial Question",
        date: "2024-01-01T00:00:00Z",
      },
    });

    const mockProvider = createMockEmailProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-123",
        messages: [userMessage], // Only user's message, no external reply
        snippet: "Test",
      }),
      draftEmail: vi.fn().mockResolvedValue({ draftId: "draft-123" }),
    });

    await generateFollowUpDraft({
      emailAccount: mockEmailAccount,
      threadId: "thread-123",
      provider: mockProvider,
      logger,
    });

    // Should use user's message with recipient override
    expect(mockProvider.draftEmail).toHaveBeenCalledWith(
      userMessage,
      expect.objectContaining({
        to: "bob@external.com", // Override to send to original recipient
        content: expect.any(String),
      }),
      "user@test.com",
      undefined,
    );
  });

  it("generates draft for multiple user messages without external replies", async () => {
    // Scenario: User sends multiple messages, still no reply
    const userMessage1 = getMockParsedMessage({
      id: "user-msg-1",
      internalDate: "1704067200000", // Earlier
      headers: {
        from: "user@test.com",
        to: "bob@external.com",
        subject: "Initial Question",
        date: "2024-01-01T00:00:00Z",
      },
    });
    const userMessage2 = getMockParsedMessage({
      id: "user-msg-2",
      internalDate: "1704153600000", // Later
      headers: {
        from: "user@test.com",
        to: "bob@external.com",
        subject: "Re: Initial Question",
        date: "2024-01-02T00:00:00Z",
      },
    });

    const mockProvider = createMockEmailProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-123",
        messages: [userMessage1, userMessage2],
        snippet: "Test",
      }),
      draftEmail: vi.fn().mockResolvedValue({ draftId: "draft-123" }),
    });

    await generateFollowUpDraft({
      emailAccount: mockEmailAccount,
      threadId: "thread-123",
      provider: mockProvider,
      logger,
    });

    // Should use the LAST user message (most recent)
    expect(mockProvider.draftEmail).toHaveBeenCalledWith(
      userMessage2,
      expect.objectContaining({
        to: "bob@external.com",
      }),
      "user@test.com",
      undefined,
    );
  });

  it("does not generate draft when thread has no messages", async () => {
    const mockProvider = createMockEmailProvider({
      getThread: vi.fn().mockResolvedValue({
        id: "thread-123",
        messages: [],
        snippet: "",
      }),
    });

    await generateFollowUpDraft({
      emailAccount: mockEmailAccount,
      threadId: "thread-123",
      provider: mockProvider,
      logger,
    });

    expect(mockProvider.draftEmail).not.toHaveBeenCalled();
  });
});
