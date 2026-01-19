import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchMessagesAndGenerateDraft } from "./generate-draft";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/ai/reply/draft-reply", () => ({
  aiDraftReply: vi.fn(),
}));

vi.mock("@/utils/redis/reply", () => ({
  getReply: vi.fn().mockResolvedValue(null),
  saveReply: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(),
    },
    knowledge: {
      findMany: vi.fn().mockResolvedValue([]),
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

vi.mock("@/utils/ai/knowledge/extract", () => ({
  aiExtractRelevantKnowledge: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/ai/reply/reply-context-collector", () => ({
  aiCollectReplyContext: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/ai/calendar/availability", () => ({
  aiGetCalendarAvailability: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/user/get", () => ({
  getWritingStyle: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/ai/mcp/mcp-agent", () => ({
  mcpAgent: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/meeting-briefs/recipient-context", () => ({
  getMeetingContext: vi.fn().mockResolvedValue([]),
  formatMeetingContextForPrompt: vi.fn().mockReturnValue(null),
}));

vi.mock("@/utils/ai/knowledge/extract-from-email-history", () => ({
  aiExtractFromEmailHistory: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE: false,
  },
}));

import { aiDraftReply } from "@/utils/ai/reply/draft-reply";
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

const createMockMessage = (): ParsedMessage =>
  ({
    id: "msg-1",
    threadId: "thread-1",
    internalDate: "1704067200000",
    headers: {
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Test Subject",
      date: "2024-01-01T00:00:00Z",
      "message-id": "<test@example.com>",
    },
    textPlain: "Hello, how are you?",
    textHtml: "<p>Hello, how are you?</p>",
  }) as ParsedMessage;

const createMockClient = (): EmailProvider =>
  ({
    getThreadMessages: vi.fn(),
    getPreviousConversationMessages: vi.fn().mockResolvedValue([]),
  }) as any;

describe("fetchMessagesAndGenerateDraft - AI content escaping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("escapes malicious HTML in AI-generated content while preserving signature HTML", async () => {
    const maliciousAiOutput =
      'Hello!<div style="display:none">LEAKED SECRET DATA</div>';
    const userSignature = '<p style="color:blue">Best regards,<br>John</p>';

    vi.mocked(aiDraftReply).mockResolvedValue(maliciousAiOutput);
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      includeReferralSignature: true,
      signature: userSignature,
    } as any);

    const emailAccount = createMockEmailAccount();
    const testMessage = createMockMessage();
    const client = createMockClient();

    const result = await fetchMessagesAndGenerateDraft(
      emailAccount,
      "thread-1",
      client,
      testMessage,
      mockLogger,
    );

    // AI content should be escaped - hidden div should NOT be renderable
    expect(result).not.toContain('<div style="display:none">');
    expect(result).toContain("&lt;div");
    expect(result).toContain("LEAKED SECRET DATA"); // Text should still be visible (escaped)

    // Referral signature HTML should NOT be escaped - link should work
    expect(result).toContain(
      '<a href="https://getinboxzero.com/?ref=TEST123">Inbox Zero</a>',
    );

    // User signature HTML should NOT be escaped
    expect(result).toContain('<p style="color:blue">');
    expect(result).toContain("Best regards,<br>John</p>");
  });

  it("escapes zero-size font attacks in AI content", async () => {
    const maliciousAiOutput =
      'Normal text<span style="font-size:0">hidden instructions</span>';

    vi.mocked(aiDraftReply).mockResolvedValue(maliciousAiOutput);
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      includeReferralSignature: false,
      signature: null,
    } as any);

    const result = await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      mockLogger,
    );

    // Hidden span should be escaped
    expect(result).not.toContain('<span style="font-size:0">');
    expect(result).toContain("&lt;span");
  });

  it("escapes script tags in AI content", async () => {
    const maliciousAiOutput = 'Hello<script>alert("xss")</script>';

    vi.mocked(aiDraftReply).mockResolvedValue(maliciousAiOutput);
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      includeReferralSignature: false,
      signature: null,
    } as any);

    const result = await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      mockLogger,
    );

    // Script tags should be escaped
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("preserves normal AI text without unnecessary escaping", async () => {
    const normalAiOutput =
      "Thanks for your email! I will get back to you tomorrow.";

    vi.mocked(aiDraftReply).mockResolvedValue(normalAiOutput);
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      includeReferralSignature: false,
      signature: null,
    } as any);

    const result = await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      mockLogger,
    );

    // Normal text should be unchanged
    expect(result).toBe(normalAiOutput);
  });
});
