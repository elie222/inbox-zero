import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  fetchMessagesAndGenerateDraft,
  fetchMessagesAndGenerateDraftWithConfidenceThreshold,
} from "./generate-draft";
import type { ParsedMessage } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { DRAFT_PIPELINE_VERSION } from "@/utils/ai/reply/draft-attribution";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/ai/reply/draft-reply", () => ({
  aiDraftReplyWithConfidence: vi.fn(),
}));

vi.mock("@/utils/redis/reply", () => ({
  getReplyWithConfidence: vi.fn().mockResolvedValue(null),
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

vi.mock("@/utils/ai/reply/reply-memory", () => ({
  getReplyMemoriesForPrompt: vi.fn().mockResolvedValue({
    content: null,
    selectedMemories: [],
  }),
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

vi.mock("@/utils/attachments/draft-attachments", () => ({
  selectDraftAttachmentsForRule: vi.fn().mockResolvedValue({
    selectedAttachments: [],
    attachmentContext: null,
  }),
}));

vi.mock("@/utils/ai/knowledge/extract-from-email-history", () => ({
  aiExtractFromEmailHistory: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE: false,
  },
}));

import { aiDraftReplyWithConfidence } from "@/utils/ai/reply/draft-reply";
import { getReplyMemoriesForPrompt } from "@/utils/ai/reply/reply-memory";
import { selectDraftAttachmentsForRule } from "@/utils/attachments/draft-attachments";
import { aiExtractFromEmailHistory } from "@/utils/ai/knowledge/extract-from-email-history";
import prisma from "@/utils/prisma";
import { getReplyWithConfidence, saveReply } from "@/utils/redis/reply";

const logger = createScopedLogger("reply-tracker/generate-draft-test");

type EmailAccountSignatureSettings = {
  allowHiddenAiDraftLinks: boolean;
  includeReferralSignature: boolean;
  signature: string | null;
};

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
    getThreadsWithParticipant: vi.fn().mockResolvedValue([]),
    isSentMessage: vi.fn((message: ParsedMessage) =>
      message.labelIds?.includes("SENT"),
    ),
  }) as EmailProvider;

const createMockEmailAccountSettings = (
  overrides: Partial<EmailAccountSignatureSettings> = {},
): EmailAccountSignatureSettings => ({
  allowHiddenAiDraftLinks: false,
  includeReferralSignature: false,
  signature: null,
  ...overrides,
});

describe("fetchMessagesAndGenerateDraft - AI content escaping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("escapes malicious HTML in AI-generated content while preserving signature HTML", async () => {
    const maliciousAiOutput =
      'Hello!<div style="display:none">LEAKED SECRET DATA</div>';
    const userSignature = '<p style="color:blue">Best regards,<br>John</p>';

    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: maliciousAiOutput,
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings({
        includeReferralSignature: true,
        signature: userSignature,
      }),
    );

    const emailAccount = createMockEmailAccount();
    const testMessage = createMockMessage();
    const client = createMockClient();

    const result = await fetchMessagesAndGenerateDraft(
      emailAccount,
      "thread-1",
      client,
      testMessage,
      logger,
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

  it("passes retrieved reply memories into the draft prompt call", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "Thanks for the note.",
      confidence: DraftReplyConfidence.STANDARD,
      attribution: null,
    });
    vi.mocked(getReplyMemoriesForPrompt).mockResolvedValue({
      content:
        "1. [FACT | TOPIC:pricing] Mention that pricing depends on seat count.",
      selectedMemories: [
        {
          id: "memory-1",
          kind: "FACT",
          scopeType: "TOPIC",
        },
      ],
    } as any);
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings(),
    );

    await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
    );

    expect(getReplyMemoriesForPrompt).toHaveBeenCalledWith({
      emailAccountId: "test-account-id",
      senderEmail: "sender@example.com",
      emailContent: expect.stringContaining("Hello, how are you?"),
      logger,
    });
    expect(aiDraftReplyWithConfidence).toHaveBeenCalledWith(
      expect.objectContaining({
        replyMemoryContent:
          "1. [FACT | TOPIC:pricing] Mention that pricing depends on seat count.",
      }),
    );
  });

  it("escapes zero-size font attacks in AI content", async () => {
    const maliciousAiOutput =
      'Normal text<span style="font-size:0">hidden instructions</span>';

    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: maliciousAiOutput,
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings(),
    );

    const result = await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
    );

    // Hidden span should be escaped
    expect(result).not.toContain('<span style="font-size:0">');
    expect(result).toContain("&lt;span");
  });

  it("escapes script tags in AI content", async () => {
    const maliciousAiOutput = 'Hello<script>alert("xss")</script>';

    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: maliciousAiOutput,
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings(),
    );

    const result = await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
    );

    // Script tags should be escaped
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("</script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("preserves normal AI text without unnecessary escaping", async () => {
    const normalAiOutput =
      "Thanks for your email! I will get back to you tomorrow.";

    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: normalAiOutput,
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings(),
    );

    const result = await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
    );

    // Normal text should be unchanged
    expect(result).toBe(normalAiOutput);
  });

  it("preserves empty-string drafts", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings(),
    );

    const result = await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
    );

    expect(result).toBe("");
  });

  it("passes configured signature state into draft generation", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "Received the invoices. I will forward them for processing.",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings({
        signature: "<p>User Name<br>Team Lead</p>",
      }),
    );

    const result = await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
    );

    expect(result).toBe(
      "Received the invoices. I will forward them for processing.\n\n<p>User Name<br>Team Lead</p>",
    );
    expect(aiDraftReplyWithConfidence).toHaveBeenCalledWith(
      expect.objectContaining({
        hasConfiguredSignature: true,
      }),
    );
  });

  it("converts AI link markup into provider-ready draft content for the reply-tracker flow", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply:
        "Thanks for reaching out.\n\nUse [the login page](https://example.com/login) or email [support](mailto:help@example.com).",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings({ allowHiddenAiDraftLinks: true }),
    );

    const result = await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
    );

    expect(result).toContain("Thanks for reaching out.");
    expect(result).toContain(
      '<a href="https://example.com/login">the login page</a>',
    );
    expect(result).toContain('<a href="mailto:help@example.com">support</a>');
    expect(result).not.toContain("[the login page](https://example.com/login)");
    expect(result).not.toContain("[support](mailto:help@example.com)");
    expect(result).toContain(
      '\n\nUse <a href="https://example.com/login">the login page</a>',
    );
  });

  it("shows visible destinations when hidden AI draft links are disabled", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply:
        "Thanks for reaching out.\n\nUse [the login page](https://example.com/login) or email [support](mailto:help@example.com).",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings({ allowHiddenAiDraftLinks: false }),
    );

    const result = await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
    );

    expect(result).toContain("https://example.com/login");
    expect(result).toContain("help@example.com");
    expect(result).not.toContain('<a href="https://example.com/login">');
    expect(result).not.toContain('<a href="mailto:help@example.com">');
  });
});

describe("fetchMessagesAndGenerateDraft - thread ordering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes newest-first provider thread messages to chronological order before drafting", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "Draft reply",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings(),
    );

    const olderMessage: ParsedMessage = {
      ...createMockMessage(),
      id: "msg-old",
      internalDate: "2024-01-01T09:00:00Z",
      headers: {
        ...createMockMessage().headers,
        subject: "Bonjour",
      },
    };
    const newerMessage: ParsedMessage = {
      ...createMockMessage(),
      id: "msg-new",
      internalDate: "2024-01-01T10:00:00Z",
      headers: {
        ...createMockMessage().headers,
        subject: "Hi there",
      },
    };

    const client = createMockClient();
    vi.mocked(client.getThreadMessages).mockResolvedValue([
      newerMessage,
      olderMessage,
    ]);

    await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      client,
      undefined,
      logger,
    );

    const [draftArgs] = vi.mocked(aiDraftReplyWithConfidence).mock.calls[0]!;
    expect(draftArgs.messages.map((message) => message.id)).toEqual([
      "msg-old",
      "msg-new",
    ]);
  });

  it("does not summarize the current thread as historical email context", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "Draft reply",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });

    const currentMessage = createMockMessage();
    const olderMessage: ParsedMessage = {
      ...createMockMessage(),
      id: "msg-previous",
      threadId: "thread-previous",
      internalDate: "2023-12-31T10:00:00Z",
      textPlain: "Earlier context from another thread",
      textHtml: "<p>Earlier context from another thread</p>",
    };

    const client = createMockClient();
    vi.mocked(client.getThreadMessages).mockResolvedValue([currentMessage]);
    vi.mocked(client.getPreviousConversationMessages).mockResolvedValue([
      currentMessage,
      olderMessage,
    ]);

    await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      client,
      undefined,
      logger,
    );

    expect(aiExtractFromEmailHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        historicalMessages: [
          expect.objectContaining({
            id: "msg-previous",
            content: expect.stringContaining("Earlier context"),
          }),
        ],
      }),
    );
  });

  it("skips historical email extraction when only current-thread messages are returned", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "Draft reply",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });

    const currentMessage = createMockMessage();
    const client = createMockClient();
    vi.mocked(client.getThreadMessages).mockResolvedValue([currentMessage]);
    vi.mocked(client.getPreviousConversationMessages).mockResolvedValue([
      currentMessage,
    ]);

    await fetchMessagesAndGenerateDraft(
      createMockEmailAccount(),
      "thread-1",
      client,
      undefined,
      logger,
    );

    expect(aiExtractFromEmailHistory).not.toHaveBeenCalled();
  });

  it("passes recent sent replies to the same sender into the draft prompt", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "Draft reply",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
    });

    const currentMessage = createMockMessage();
    const sentReply: ParsedMessage = {
      ...createMockMessage(),
      id: "sent-reply",
      threadId: "previous-thread",
      internalDate: "2024-01-02T10:00:00Z",
      labelIds: ["SENT"],
      headers: {
        ...createMockMessage().headers,
        from: "user@example.com",
        to: "sender@example.com",
        subject: "Previous note",
      },
      textPlain: "Short previous reply.",
      textHtml: "<p>Short previous reply.</p>",
    };

    const client = createMockClient();
    vi.mocked(client.getThreadMessages).mockResolvedValue([currentMessage]);
    vi.mocked(client.getThreadsWithParticipant).mockResolvedValue([
      {
        id: "previous-thread",
        messages: [currentMessage, sentReply],
        snippet: "",
      },
    ]);

    const result = await fetchMessagesAndGenerateDraftWithConfidenceThreshold(
      createMockEmailAccount(),
      "thread-1",
      client,
      undefined,
      logger,
      DraftReplyConfidence.ALL_EMAILS,
    );

    expect(client.getThreadsWithParticipant).toHaveBeenCalledWith({
      participantEmail: "sender@example.com",
      maxThreads: 8,
    });
    expect(aiDraftReplyWithConfidence).toHaveBeenCalledWith(
      expect.objectContaining({
        senderReplyExamples: expect.stringContaining("Short previous reply"),
      }),
    );
    expect(aiDraftReplyWithConfidence).toHaveBeenCalledWith(
      expect.objectContaining({
        senderReplyExamples: expect.not.stringContaining("Hello, how are you?"),
      }),
    );
    expect(result.draftContextMetadata).toEqual(
      expect.objectContaining({
        senderHistory: expect.objectContaining({
          sameSenderReplyExamplesInjected: true,
          sameSenderReplyExampleCount: 1,
        }),
      }),
    );
  });
});

describe("fetchMessagesAndGenerateDraftWithConfidenceThreshold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getReplyWithConfidence).mockResolvedValue(null);
    vi.mocked(selectDraftAttachmentsForRule).mockResolvedValue({
      selectedAttachments: [],
      attachmentContext: null,
    });
  });

  it("uses cached drafts when cached confidence meets the threshold", async () => {
    vi.mocked(getReplyWithConfidence).mockResolvedValue({
      reply: "Cached draft reply",
      confidence: DraftReplyConfidence.STANDARD,
      attribution: {
        provider: "openai",
        modelName: "gpt-5.1",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });

    const result = await fetchMessagesAndGenerateDraftWithConfidenceThreshold(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
      DraftReplyConfidence.STANDARD,
    );

    expect(result).toEqual({
      draft: "Cached draft reply",
      confidence: DraftReplyConfidence.STANDARD,
      attribution: {
        provider: "openai",
        modelName: "gpt-5.1",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });
    expect(aiDraftReplyWithConfidence).not.toHaveBeenCalled();
  });

  it("regenerates drafts when cached confidence is below the threshold", async () => {
    vi.mocked(getReplyWithConfidence).mockResolvedValue({
      reply: "Old cached draft",
      confidence: DraftReplyConfidence.ALL_EMAILS,
    });
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "Fresh draft",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
      attribution: {
        provider: "anthropic",
        modelName: "claude-sonnet-4-5",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });
    vi.mocked(getReplyMemoriesForPrompt).mockResolvedValueOnce({
      content:
        "1. [FACT | TOPIC:pricing] Mention that pricing depends on seat count.",
      selectedMemories: [
        {
          id: "memory-1",
          kind: "FACT",
          scopeType: "TOPIC",
        },
      ],
    } as any);
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings(),
    );

    const result = await fetchMessagesAndGenerateDraftWithConfidenceThreshold(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
      DraftReplyConfidence.STANDARD,
    );

    expect(result).toMatchObject({
      draft: "Fresh draft",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
      attribution: {
        provider: "anthropic",
        modelName: "claude-sonnet-4-5",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });
    expect(result.draftContextMetadata).toEqual(
      expect.objectContaining({
        replyMemories: expect.objectContaining({
          ids: ["memory-1"],
        }),
      }),
    );
    expect(saveReply).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "test-account-id",
        messageId: "msg-1",
        reply: "Fresh draft",
        confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
        attribution: {
          provider: "anthropic",
          modelName: "claude-sonnet-4-5",
          pipelineVersion: DRAFT_PIPELINE_VERSION,
        },
        draftContextMetadata: expect.objectContaining({
          replyMemories: expect.objectContaining({
            ids: ["memory-1"],
          }),
        }),
      }),
    );
  });

  it("skips drafting when confidence is below the threshold", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "Draft that should be skipped",
      confidence: DraftReplyConfidence.ALL_EMAILS,
      attribution: {
        provider: "openai",
        modelName: "gpt-5.1",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });

    const result = await fetchMessagesAndGenerateDraftWithConfidenceThreshold(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
      DraftReplyConfidence.STANDARD,
    );

    expect(result).toMatchObject({
      draft: null,
      confidence: DraftReplyConfidence.ALL_EMAILS,
      attribution: {
        provider: "openai",
        modelName: "gpt-5.1",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });
    expect(result.draftContextMetadata).toEqual(
      expect.objectContaining({
        replyMemories: expect.objectContaining({
          ids: ["memory-1"],
        }),
      }),
    );
    expect(saveReply).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "test-account-id",
        messageId: "msg-1",
        reply: "Draft that should be skipped",
        confidence: DraftReplyConfidence.ALL_EMAILS,
        attribution: {
          provider: "openai",
          modelName: "gpt-5.1",
          pipelineVersion: DRAFT_PIPELINE_VERSION,
        },
        draftContextMetadata: expect.objectContaining({
          replyMemories: expect.objectContaining({
            ids: ["memory-1"],
          }),
        }),
      }),
    );
  });

  it("returns a generated draft even when caching it fails", async () => {
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "Fresh draft",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
      attribution: {
        provider: "anthropic",
        modelName: "claude-sonnet-4-5",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(
      createMockEmailAccountSettings(),
    );
    vi.mocked(saveReply).mockRejectedValueOnce(new Error("redis unavailable"));

    const result = await fetchMessagesAndGenerateDraftWithConfidenceThreshold(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
      DraftReplyConfidence.STANDARD,
    );

    expect(result).toMatchObject({
      draft: "Fresh draft",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
      attribution: {
        provider: "anthropic",
        modelName: "claude-sonnet-4-5",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });
    expect(result.draftContextMetadata).toEqual(
      expect.objectContaining({
        replyMemories: expect.objectContaining({
          ids: ["memory-1"],
        }),
      }),
    );
  });

  it("passes selected attachment context into drafting and caches it per rule", async () => {
    const selectedAttachments = [
      {
        driveConnectionId: "drive-1",
        fileId: "file-1",
        filename: "lease.pdf",
        mimeType: "application/pdf",
        reason: "Matched the requested property packet",
      },
    ];

    vi.mocked(selectDraftAttachmentsForRule).mockResolvedValue({
      selectedAttachments,
      attachmentContext: `<attachment>
filename: lease.pdf
path: Properties/Lease.pdf
reason: Matched the requested property packet
</attachment>`,
    });
    vi.mocked(aiDraftReplyWithConfidence).mockResolvedValue({
      reply: "Attached the lease packet for review.",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
      attribution: null,
    });
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      includeReferralSignature: false,
      signature: null,
    } as any);

    const result = await fetchMessagesAndGenerateDraftWithConfidenceThreshold(
      createMockEmailAccount(),
      "thread-1",
      createMockClient(),
      createMockMessage(),
      logger,
      DraftReplyConfidence.ALL_EMAILS,
      "rule-1",
    );

    expect(selectDraftAttachmentsForRule).toHaveBeenCalledWith({
      emailAccount: expect.objectContaining({ id: "test-account-id" }),
      ruleId: "rule-1",
      emailContent: expect.any(String),
      logger,
    });

    expect(aiDraftReplyWithConfidence).toHaveBeenCalledWith(
      expect.objectContaining({
        attachmentContext: expect.stringContaining("lease.pdf"),
      }),
    );

    expect(saveReply).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "test-account-id",
        messageId: "msg-1",
        reply: "Attached the lease packet for review.",
        confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
        attribution: null,
        attachments: selectedAttachments,
        ruleId: "rule-1",
        draftContextMetadata: expect.objectContaining({
          attachments: {
            injected: true,
            selectedCount: 1,
          },
        }),
      }),
    );

    expect(result).toMatchObject({
      draft: "Attached the lease packet for review.",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
      attribution: null,
      attachments: selectedAttachments,
    });
    expect(result.draftContextMetadata).toEqual(
      expect.objectContaining({
        attachments: {
          injected: true,
          selectedCount: 1,
        },
      }),
    );
  });
});
