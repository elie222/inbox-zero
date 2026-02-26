import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { getEmailAccount, getMockMessage } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));

const {
  envState,
  mockToolCallAgentStream,
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockPrisma,
} = vi.hoisted(() => ({
  envState: {
    sendEmailEnabled: true,
  },
  mockToolCallAgentStream: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
  mockPosthogCaptureEvent: vi.fn(),
  mockPrisma: {
    emailAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    rule: {
      findUnique: vi.fn(),
    },
    knowledge: {
      create: vi.fn(),
    },
    chatMemory: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/utils/llms", () => ({
  toolCallAgentStream: mockToolCallAgentStream,
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mockCreateEmailProvider,
}));

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: mockPosthogCaptureEvent,
}));

vi.mock("@/utils/prisma", () => ({
  default: mockPrisma,
}));

vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_EMAIL_SEND_ENABLED() {
      return envState.sendEmailEnabled;
    },
  },
}));

const logger = createScopedLogger("ai-assistant-chat-test");

const baseMessages: ModelMessage[] = [
  {
    role: "user",
    content: "Give me an inbox update.",
  },
];

async function loadAssistantChatModule({ emailSend }: { emailSend: boolean }) {
  envState.sendEmailEnabled = emailSend;
  vi.resetModules();
  return await import("@/utils/ai/assistant/chat");
}

async function captureToolSet(
  emailSend = true,
  provider: "google" | "microsoft" = "google",
) {
  const { aiProcessAssistantChat } = await loadAssistantChatModule({
    emailSend,
  });
  const user = getEmailAccount();
  user.account.provider = provider;

  mockToolCallAgentStream.mockResolvedValue({
    toUIMessageStreamResponse: vi.fn(),
  });

  await aiProcessAssistantChat({
    messages: baseMessages,
    emailAccountId: "email-account-id",
    user,
    logger,
  });

  return mockToolCallAgentStream.mock.calls[0][0].tools;
}

describe("aiProcessAssistantChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.sendEmailEnabled = true;
  });

  it("includes expanded prompt guidance and new tool set when email sending is enabled", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: baseMessages,
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];

    expect(args.messages[0].role).toBe("system");
    expect(args.messages[0].content).toContain("Core responsibilities:");
    expect(args.messages[0].content).toContain(
      "Tool usage strategy (progressive disclosure):",
    );
    expect(args.messages[0].content).toContain("Provider context:");
    expect(args.messages[0].content).toContain("Inbox triage guidance:");
    expect(args.messages[0].content).toContain(
      "Conversation status behavior should be customized by updating conversation rules directly",
    );
    expect(args.messages[0].content).toContain(
      "Never claim that you changed a setting, rule, inbox state, or memory unless the corresponding write tool call in this turn succeeded.",
    );
    expect(args.messages[0].content).toContain(
      "If a write tool fails or is unavailable, clearly state that nothing changed and explain the reason.",
    );
    expect(args.messages[0].content).toContain(
      "Only send emails when the user clearly asks to send now.",
    );
    expect(args.messages[0].content).toContain(
      "sendEmail, replyEmail, and forwardEmail prepare a pending action only.",
    );
    expect(args.messages[0].content).toContain(
      "After these tools run, explicitly tell the user the email is pending confirmation.",
    );
    expect(args.tools.getAccountOverview).toBeDefined();
    expect(args.tools.getAssistantCapabilities).toBeDefined();
    expect(args.tools.searchInbox).toBeDefined();
    expect(args.tools.readEmail).toBeDefined();
    expect(args.tools.manageInbox).toBeDefined();
    expect(args.tools.updateAssistantSettings).toBeDefined();
    expect(args.tools.updateInboxFeatures).toBeDefined();
    expect(args.tools.sendEmail).toBeDefined();
    expect(args.tools.forwardEmail).toBeDefined();
  });

  it("omits sendEmail tool when email sending is disabled", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: false,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: baseMessages,
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    expect(args.tools.sendEmail).toBeUndefined();
    expect(args.tools.forwardEmail).toBeUndefined();
  });

  it("adds OpenAI prompt cache key when chatId is provided", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: baseMessages,
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      chatId: "chat-123",
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    expect(args.providerOptions).toEqual({
      openai: {
        promptCacheKey: "assistant-chat:chat-123",
      },
    });
  });

  it("does not add chat provider options when chatId is missing", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: baseMessages,
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    expect(args.providerOptions).toBeUndefined();
  });

  it("places context between history and latest message for cache-friendly ordering", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: [
        { role: "user", content: "first user message" },
        { role: "assistant", content: "assistant response" },
        { role: "user", content: "latest user message" },
      ],
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      memories: [{ content: "Remember this", date: "2026-02-18" }],
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    expect(args.messages[1]).toMatchObject({
      role: "user",
      content: "first user message",
    });
    expect(args.messages[2]).toMatchObject({
      role: "assistant",
      content: "assistant response",
    });
    expect(args.messages[3].role).toBe("user");
    expect(args.messages[3].content).toContain(
      "Memories from previous conversations:",
    );
    expect(args.messages.at(-1)).toEqual({
      role: "user",
      content: "latest user message",
    });
  });

  it("adds anthropic cache breakpoints to stable-prefix messages", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: [
        { role: "user", content: "history user" },
        { role: "assistant", content: "history assistant" },
        { role: "user", content: "latest user" },
      ],
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    expect(args.messages[0].providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
    });
    expect(args.messages[2].providerOptions?.anthropic?.cacheControl).toEqual({
      type: "ephemeral",
    });
    expect(args.messages.at(-1).providerOptions).toBeUndefined();
  });

  it("uses systemType (not rule name) to detect conversation status fix context", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: [
        {
          role: "user",
          content: "Fix this classification",
        },
      ],
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      context: {
        type: "fix-rule",
        message: {
          id: "message-1",
          threadId: "thread-1",
          snippet: "test snippet",
          headers: {
            from: "sender@example.com",
            to: "user@example.com",
            subject: "Subject",
            date: new Date().toISOString(),
          },
        },
        results: [
          {
            // Intentionally non-conversation name; detection should key off systemType
            ruleName: "Custom Renamed Rule",
            systemType: "TO_REPLY",
            reason: "matched",
          },
        ],
        expected: "none",
      },
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const hiddenContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("Hidden context for the user's request"),
    );

    expect(hiddenContext?.content).toContain(
      "This fix is about conversation status classification",
    );
  });

  it("skips expected rule lookup when results already show conversation status", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: [
        {
          role: "user",
          content: "Fix this classification",
        },
      ],
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      context: {
        type: "fix-rule",
        message: {
          id: "message-1",
          threadId: "thread-1",
          snippet: "test snippet",
          headers: {
            from: "sender@example.com",
            to: "user@example.com",
            subject: "Subject",
            date: new Date().toISOString(),
          },
        },
        results: [
          {
            ruleName: "Custom Renamed Rule",
            systemType: "TO_REPLY",
            reason: "matched",
          },
        ],
        expected: {
          id: "rule-to-reply",
          name: "To Reply (renamed)",
        },
      },
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const hiddenContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("Hidden context for the user's request"),
    );

    expect(hiddenContext?.content).toContain(
      "This fix is about conversation status classification",
    );
    expect(mockPrisma.rule.findUnique).not.toHaveBeenCalled();
  });

  it("does not treat non-conversation systemType as conversation fix context", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: [
        {
          role: "user",
          content: "Fix this classification",
        },
      ],
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      context: {
        type: "fix-rule",
        message: {
          id: "message-1",
          threadId: "thread-1",
          snippet: "test snippet",
          headers: {
            from: "sender@example.com",
            to: "user@example.com",
            subject: "Subject",
            date: new Date().toISOString(),
          },
        },
        results: [
          {
            // Intentionally conversation-like name; detection should ignore names
            ruleName: "To Reply",
            systemType: "COLD_EMAIL",
            reason: "matched",
          },
        ],
        expected: "none",
      },
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const hiddenContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("Hidden context for the user's request"),
    );

    expect(hiddenContext?.content).not.toContain(
      "This fix is about conversation status classification",
    );
  });

  it("uses expected rule system type from server to detect conversation fix context", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });
    mockPrisma.rule.findUnique.mockResolvedValue({
      systemType: "TO_REPLY",
      emailAccountId: "email-account-id",
    });

    await aiProcessAssistantChat({
      messages: [
        {
          role: "user",
          content: "Fix this classification",
        },
      ],
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      context: {
        type: "fix-rule",
        message: {
          id: "message-1",
          threadId: "thread-1",
          snippet: "test snippet",
          headers: {
            from: "sender@example.com",
            to: "user@example.com",
            subject: "Subject",
            date: new Date().toISOString(),
          },
        },
        results: [
          {
            ruleName: "Custom Rule",
            systemType: "COLD_EMAIL",
            reason: "matched",
          },
        ],
        expected: {
          id: "rule-to-reply",
          name: "To Reply (renamed)",
        },
      },
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const hiddenContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("Hidden context for the user's request"),
    );

    expect(hiddenContext?.content).toContain(
      "This fix is about conversation status classification",
    );
    expect(mockPrisma.rule.findUnique).toHaveBeenCalledWith({
      where: { id: "rule-to-reply" },
      select: { systemType: true, emailAccountId: true },
    });
  });

  it("falls back when expected rule lookup fails", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });
    mockPrisma.rule.findUnique.mockRejectedValue(new Error("DB unavailable"));

    await aiProcessAssistantChat({
      messages: [
        {
          role: "user",
          content: "Fix this classification",
        },
      ],
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      context: {
        type: "fix-rule",
        message: {
          id: "message-1",
          threadId: "thread-1",
          snippet: "test snippet",
          headers: {
            from: "sender@example.com",
            to: "user@example.com",
            subject: "Subject",
            date: new Date().toISOString(),
          },
        },
        results: [
          {
            ruleName: "Custom Rule",
            systemType: "COLD_EMAIL",
            reason: "matched",
          },
        ],
        expected: {
          id: "rule-to-reply",
          name: "To Reply (renamed)",
        },
      },
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const hiddenContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("Hidden context for the user's request"),
    );

    expect(hiddenContext?.content).not.toContain(
      "This fix is about conversation status classification",
    );
  });

  it("supports legacy expected context with rule name only", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });
    mockPrisma.rule.findUnique.mockResolvedValue({
      systemType: "TO_REPLY",
    });

    await aiProcessAssistantChat({
      messages: [
        {
          role: "user",
          content: "Fix this classification",
        },
      ],
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      context: {
        type: "fix-rule",
        message: {
          id: "message-1",
          threadId: "thread-1",
          snippet: "test snippet",
          headers: {
            from: "sender@example.com",
            to: "user@example.com",
            subject: "Subject",
            date: new Date().toISOString(),
          },
        },
        results: [
          {
            ruleName: "Custom Rule",
            systemType: "COLD_EMAIL",
            reason: "matched",
          },
        ],
        expected: {
          name: "To Reply (renamed)",
        },
      },
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const hiddenContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("Hidden context for the user's request"),
    );

    expect(hiddenContext?.content).toContain(
      "This fix is about conversation status classification",
    );
    expect(mockPrisma.rule.findUnique).toHaveBeenCalledWith({
      where: {
        name_emailAccountId: {
          name: "To Reply (renamed)",
          emailAccountId: "email-account-id",
        },
      },
      select: { systemType: true },
    });
  });

  it("ignores expected rule lookup when rule belongs to another account", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });
    mockPrisma.rule.findUnique.mockResolvedValue({
      systemType: "TO_REPLY",
      emailAccountId: "other-account-id",
    });

    await aiProcessAssistantChat({
      messages: [
        {
          role: "user",
          content: "Fix this classification",
        },
      ],
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      context: {
        type: "fix-rule",
        message: {
          id: "message-1",
          threadId: "thread-1",
          snippet: "test snippet",
          headers: {
            from: "sender@example.com",
            to: "user@example.com",
            subject: "Subject",
            date: new Date().toISOString(),
          },
        },
        results: [
          {
            ruleName: "Custom Rule",
            systemType: "COLD_EMAIL",
            reason: "matched",
          },
        ],
        expected: {
          id: "rule-to-reply",
          name: "To Reply (renamed)",
        },
      },
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const hiddenContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("Hidden context for the user's request"),
    );

    expect(hiddenContext?.content).not.toContain(
      "This fix is about conversation status classification",
    );
  });

  it("requires reading rules immediately before updating rule conditions", async () => {
    const tools = await captureToolSet(true, "google");

    const result = await tools.updateRuleConditions.execute({
      ruleName: "To Reply",
      condition: {
        aiInstructions: "Updated instructions",
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("call getUserRulesAndSettings");
    expect(mockPrisma.rule.findUnique).not.toHaveBeenCalled();
  });

  it("rejects stale rule reads before updating rule conditions", async () => {
    const tools = await captureToolSet(true, "google");

    mockPrisma.emailAccount.findUnique.mockResolvedValue({
      about: "About",
      rules: [
        {
          name: "To Reply",
          instructions: "Emails I need to respond to",
          updatedAt: new Date("2026-02-13T10:00:00.000Z"),
          from: null,
          to: null,
          subject: null,
          conditionalOperator: null,
          enabled: true,
          runOnThreads: true,
          actions: [],
        },
      ],
    });

    await tools.getUserRulesAndSettings.execute({});

    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-1",
      name: "To Reply",
      updatedAt: new Date("2026-02-13T12:00:00.000Z"),
      instructions: "Emails I need to respond to",
      from: null,
      to: null,
      subject: null,
      conditionalOperator: "AND",
    });

    const result = await tools.updateRuleConditions.execute({
      ruleName: "To Reply",
      condition: {
        aiInstructions: "Updated instructions",
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Rule changed since the last read");
  });
  it("returns cleared filing prompt in updateInboxFeatures response", async () => {
    const tools = await captureToolSet(true, "google");

    mockPrisma.emailAccount.findUnique.mockResolvedValue({
      meetingBriefingsEnabled: true,
      meetingBriefingsMinutesBefore: 30,
      meetingBriefsSendEmail: true,
      filingEnabled: true,
      filingPrompt: "Old prompt",
    });
    mockPrisma.emailAccount.update.mockResolvedValue({});

    const result = await tools.updateInboxFeatures.execute({
      filingPrompt: null,
    });

    expect(mockPrisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          filingPrompt: null,
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        updated: expect.objectContaining({
          filingPrompt: null,
        }),
      }),
    );
  });

  it("keeps unlabeled Google messages as pass-through", async () => {
    const tools = await captureToolSet(true, "google");

    mockCreateEmailProvider.mockResolvedValue({
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [
          {
            id: "message-1",
            threadId: "thread-1",
            labelIds: undefined,
            snippet: "Message without labels",
            historyId: "hist-1",
            inline: [],
            headers: {
              from: "sender1@example.com",
              to: "user@example.com",
              subject: "No labels",
              date: new Date().toISOString(),
            },
            subject: "No labels",
            date: new Date().toISOString(),
            attachments: [],
          },
        ],
        nextPageToken: undefined,
      }),
      getLabels: vi.fn().mockResolvedValue([]),
      archiveThreadWithLabel: vi.fn(),
      markReadThread: vi.fn(),
      bulkArchiveFromSenders: vi.fn(),
      sendEmailWithHtml: vi.fn(),
    });

    const result = await tools.searchInbox.execute({
      query: "today",
      after: undefined,
      before: undefined,
      limit: 20,
      pageToken: undefined,
      inboxOnly: true,
      unreadOnly: false,
    });

    expect(result.totalReturned).toBe(1);
  });

  it("excludes unlabeled messages in unread-only searches", async () => {
    const tools = await captureToolSet(true, "google");

    mockCreateEmailProvider.mockResolvedValue({
      getMessagesWithPagination: vi.fn().mockResolvedValue({
        messages: [
          {
            id: "message-1",
            threadId: "thread-1",
            labelIds: undefined,
            snippet: "Message without labels",
            historyId: "hist-1",
            inline: [],
            headers: {
              from: "sender1@example.com",
              to: "user@example.com",
              subject: "No labels",
              date: new Date().toISOString(),
            },
            subject: "No labels",
            date: new Date().toISOString(),
            attachments: [],
          },
        ],
        nextPageToken: undefined,
      }),
      getLabels: vi.fn().mockResolvedValue([]),
      archiveThreadWithLabel: vi.fn(),
      markReadThread: vi.fn(),
      bulkArchiveFromSenders: vi.fn(),
      sendEmailWithHtml: vi.fn(),
    });

    const result = await tools.searchInbox.execute({
      query: "today",
      after: undefined,
      before: undefined,
      limit: 20,
      pageToken: undefined,
      inboxOnly: true,
      unreadOnly: true,
    });

    expect(result.totalReturned).toBe(0);
  });

  it("sends email with allowlisted chat params only", async () => {
    const tools = await captureToolSet(true, "google");
    const sendEmailWithHtml = vi.fn().mockResolvedValue({
      messageId: "message-1",
      threadId: "thread-1",
    });

    mockCreateEmailProvider.mockResolvedValue({
      sendEmailWithHtml,
    });

    const result = await tools.sendEmail.execute({
      to: "recipient@example.test",
      cc: "observer@example.test",
      subject: "Subject line",
      messageHtml: "<p>Hello</p>",
    });

    expect(result).toEqual({
      actionType: "send_email",
      confirmationState: "pending",
      pendingAction: {
        to: "recipient@example.test",
        cc: "observer@example.test",
        bcc: null,
        subject: "Subject line",
        messageHtml: "<p>Hello</p>",
        from: "user@test.com",
      },
      provider: "google",
      requiresConfirmation: true,
      success: true,
    });

    expect(sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("rejects unsupported from field in chat send params", async () => {
    const tools = await captureToolSet(true, "google");
    mockCreateEmailProvider.mockResolvedValue({
      sendEmailWithHtml: vi.fn(),
    });
    const providerCallsBefore = mockCreateEmailProvider.mock.calls.length;

    const result = await tools.sendEmail.execute({
      to: "recipient@example.test",
      from: "sender.alias@example.test",
      subject: "Subject line",
      messageHtml: "<p>Hello</p>",
    } as any);

    expect(result).toEqual({
      error: 'Invalid sendEmail input: unsupported field "from"',
    });
    expect(mockCreateEmailProvider).toHaveBeenCalledTimes(providerCallsBefore);
  });

  it("rejects send params when to field has no email address", async () => {
    const tools = await captureToolSet(true, "google");
    mockCreateEmailProvider.mockResolvedValue({
      sendEmailWithHtml: vi.fn(),
    });
    const providerCallsBefore = mockCreateEmailProvider.mock.calls.length;

    const result = await tools.sendEmail.execute({
      to: "Jack Cohen",
      subject: "Subject line",
      messageHtml: "<p>Hello</p>",
    });

    expect(result).toEqual({
      error: "Invalid sendEmail input: to must include valid email address(es)",
    });
    expect(mockCreateEmailProvider).toHaveBeenCalledTimes(providerCallsBefore);
  });

  it("allows bcc field in chat send params", async () => {
    const tools = await captureToolSet(true, "google");
    const sendEmailWithHtml = vi.fn().mockResolvedValue({
      messageId: "message-2",
      threadId: "thread-2",
    });
    mockCreateEmailProvider.mockResolvedValue({
      sendEmailWithHtml,
    });

    const result = await tools.sendEmail.execute({
      to: "recipient@example.test",
      bcc: "hidden@example.test",
      subject: "Subject line",
      messageHtml: "<p>Done</p>",
    });

    expect(result).toEqual({
      actionType: "send_email",
      confirmationState: "pending",
      pendingAction: {
        to: "recipient@example.test",
        cc: null,
        bcc: "hidden@example.test",
        subject: "Subject line",
        messageHtml: "<p>Done</p>",
        from: "user@test.com",
      },
      provider: "google",
      requiresConfirmation: true,
      success: true,
    });

    expect(sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("forwards email with allowlisted chat params only", async () => {
    const tools = await captureToolSet(true, "google");
    const message = getMockMessage({ id: "message-1", threadId: "thread-1" });
    const getMessage = vi.fn().mockResolvedValue(message);
    const forwardEmail = vi.fn().mockResolvedValue(undefined);

    mockCreateEmailProvider.mockResolvedValue({
      getMessage,
      forwardEmail,
    });

    const result = await tools.forwardEmail.execute({
      messageId: "message-1",
      to: "recipient@example.test",
      cc: "observer@example.test",
      content: "FYI",
    });

    expect(result).toEqual({
      actionType: "forward_email",
      confirmationState: "pending",
      pendingAction: {
        messageId: "message-1",
        to: "recipient@example.test",
        cc: "observer@example.test",
        bcc: null,
        content: "FYI",
      },
      reference: {
        messageId: "message-1",
        threadId: "thread-1",
        from: "test@example.com",
        subject: "Test",
      },
      requiresConfirmation: true,
      success: true,
    });

    expect(getMessage).toHaveBeenCalledTimes(1);
    expect(getMessage).toHaveBeenCalledWith("message-1");
    expect(forwardEmail).not.toHaveBeenCalled();
  });

  it("rejects unsupported from field in chat forward params", async () => {
    const tools = await captureToolSet(true, "google");
    const getMessage = vi.fn();
    const forwardEmail = vi.fn();

    mockCreateEmailProvider.mockResolvedValue({
      getMessage,
      forwardEmail,
    });
    const providerCallsBefore = mockCreateEmailProvider.mock.calls.length;

    const result = await tools.forwardEmail.execute({
      messageId: "message-1",
      to: "recipient@example.test",
      from: "sender.alias@example.test",
    } as any);

    expect(result).toEqual({
      error: 'Invalid forwardEmail input: unsupported field "from"',
    });
    expect(mockCreateEmailProvider).toHaveBeenCalledTimes(providerCallsBefore);
    expect(getMessage).not.toHaveBeenCalled();
    expect(forwardEmail).not.toHaveBeenCalled();
  });

  it("registers saveMemory tool", async () => {
    const tools = await captureToolSet();
    expect(tools.saveMemory).toBeDefined();
  });

  it("saveMemory creates a new memory", async () => {
    const tools = await captureToolSet();
    mockPrisma.chatMemory.findFirst.mockResolvedValue(null);

    const result = await tools.saveMemory.execute({
      content: "User prefers concise responses",
    });

    expect(result.success).toBe(true);
    expect(result.content).toBe("User prefers concise responses");
    expect(result.deduplicated).toBeUndefined();
    expect(mockPrisma.chatMemory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: "User prefers concise responses",
        emailAccountId: "email-account-id",
      }),
    });
  });

  it("saveMemory deduplicates when identical memory exists", async () => {
    const tools = await captureToolSet();
    mockPrisma.chatMemory.findFirst.mockResolvedValue({ id: "existing-id" });

    const result = await tools.saveMemory.execute({
      content: "User prefers concise responses",
    });

    expect(result.success).toBe(true);
    expect(result.deduplicated).toBe(true);
    expect(mockPrisma.chatMemory.create).not.toHaveBeenCalled();
  });

  it("injects memories into model messages when provided", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: baseMessages,
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      memories: [
        { content: "User likes dark mode", date: "2026-02-10" },
        { content: "Prefers batch archive", date: "2026-02-12" },
      ],
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const memoriesMessage = args.messages.find(
      (m: { role: string; content: string }) =>
        m.role === "user" &&
        m.content.includes("Memories from previous conversations"),
    );

    expect(memoriesMessage).toBeDefined();
    expect(memoriesMessage.content).toContain(
      "[2026-02-10] User likes dark mode",
    );
    expect(memoriesMessage.content).toContain(
      "[2026-02-12] Prefers batch archive",
    );
  });

  it("does not inject memories message when memories are empty", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: baseMessages,
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
      memories: [],
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const memoriesMessage = args.messages.find(
      (m: { role: string; content: string }) =>
        m.role === "user" &&
        m.content.includes("Memories from previous conversations"),
    );

    expect(memoriesMessage).toBeUndefined();
  });

  it("updateAbout in replace mode overwrites existing content", async () => {
    const tools = await captureToolSet();

    mockPrisma.emailAccount.findUnique.mockResolvedValue({
      about: "Old instructions",
    });
    mockPrisma.emailAccount.update.mockResolvedValue({});

    const result = await tools.updateAbout.execute({
      about: "New instructions",
      mode: "replace",
    });

    expect(result.success).toBe(true);
    expect(result.updatedAbout).toBe("New instructions");
    expect(mockPrisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { about: "New instructions" },
      }),
    );
  });

  it("updateAbout in append mode preserves existing content", async () => {
    const tools = await captureToolSet();

    mockPrisma.emailAccount.findUnique.mockResolvedValue({
      about: "Existing instructions",
    });
    mockPrisma.emailAccount.update.mockResolvedValue({});

    const result = await tools.updateAbout.execute({
      about: "Additional preference",
      mode: "append",
    });

    expect(result.success).toBe(true);
    expect(result.updatedAbout).toBe(
      "Existing instructions\nAdditional preference",
    );
    expect(result.previousAbout).toBe("Existing instructions");
    expect(mockPrisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { about: "Existing instructions\nAdditional preference" },
      }),
    );
  });

  it("updateAbout in append mode with no existing about sets new content", async () => {
    const tools = await captureToolSet();

    mockPrisma.emailAccount.findUnique.mockResolvedValue({
      about: null,
    });
    mockPrisma.emailAccount.update.mockResolvedValue({});

    const result = await tools.updateAbout.execute({
      about: "First instructions",
      mode: "append",
    });

    expect(result.success).toBe(true);
    expect(result.updatedAbout).toBe("First instructions");
  });

  it("validates action-specific manageInbox requirements before provider calls", async () => {
    const tools = await captureToolSet();
    mockCreateEmailProvider.mockClear();

    const archiveMissingThreads = await tools.manageInbox.execute({
      action: "archive_threads",
      labelId: undefined,
      read: true,
    });
    expect(archiveMissingThreads).toEqual({
      error:
        "threadIds is required when action is archive_threads or mark_read_threads",
    });

    const bulkMissingSenders = await tools.manageInbox.execute({
      action: "bulk_archive_senders",
      read: true,
    });
    expect(bulkMissingSenders).toEqual({
      error: "fromEmails is required when action is bulk_archive_senders",
    });

    const archiveEmptyThreadIds = await tools.manageInbox.execute({
      action: "archive_threads",
      threadIds: [],
      labelId: undefined,
      read: true,
    });
    expect(archiveEmptyThreadIds).toEqual({
      error:
        "Invalid manageInbox input: threadIds must include at least one thread ID",
    });

    const bulkEmptySenders = await tools.manageInbox.execute({
      action: "bulk_archive_senders",
      fromEmails: [],
      read: true,
    });
    expect(bulkEmptySenders).toEqual({
      error:
        "Invalid manageInbox input: fromEmails must include at least one sender email",
    });

    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
  });

  it("executes searchInbox and manageInbox tools with resilient behavior", async () => {
    const tools = await captureToolSet(true, "microsoft");

    const archiveThreadWithLabel = vi
      .fn()
      .mockImplementation(async (threadId: string) => {
        if (threadId === "thread-2") throw new Error("archive failed");
      });

    const getMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [
        {
          id: "message-1",
          threadId: "thread-1",
          labelIds: undefined,
          snippet: "Message without labels",
          historyId: "hist-1",
          inline: [],
          headers: {
            from: "sender1@example.com",
            to: "user@example.com",
            subject: "No labels",
            date: new Date().toISOString(),
          },
          subject: "No labels",
          date: new Date().toISOString(),
          attachments: [],
        },
        {
          id: "message-2",
          threadId: "thread-2",
          labelIds: ["inbox", "to reply", "unread"],
          snippet: "Needs reply",
          historyId: "hist-2",
          inline: [],
          headers: {
            from: "sender2@example.com",
            to: "user@example.com",
            subject: "Needs response",
            date: new Date().toISOString(),
          },
          subject: "Needs response",
          date: new Date().toISOString(),
          attachments: [],
        },
      ],
      nextPageToken: undefined,
    });

    mockCreateEmailProvider.mockResolvedValue({
      getMessagesWithPagination,
      getLabels: vi.fn().mockRejectedValue(new Error("labels unavailable")),
      archiveThreadWithLabel,
      markReadThread: vi.fn(),
      bulkArchiveFromSenders: vi.fn(),
      sendEmailWithHtml: vi.fn(),
    });

    const searchResult = await tools.searchInbox.execute({
      query: "today",
      after: undefined,
      before: undefined,
      limit: 20,
      pageToken: undefined,
      inboxOnly: true,
      unreadOnly: false,
    });

    expect(mockCreateEmailProvider).toHaveBeenCalled();
    expect(getMessagesWithPagination).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "today",
        inboxOnly: true,
        unreadOnly: false,
      }),
    );
    expect(searchResult.totalReturned).toBe(2);
    expect(searchResult.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ messageId: "message-1" }),
        expect.objectContaining({ category: "to_reply" }),
      ]),
    );

    const manageResult = await tools.manageInbox.execute({
      action: "archive_threads",
      threadIds: ["thread-1", "thread-2"],
      labelId: undefined,
    });

    expect(archiveThreadWithLabel).toHaveBeenCalledTimes(2);
    expect(manageResult).toEqual(
      expect.objectContaining({
        success: false,
        requestedCount: 2,
        successCount: 1,
        failedCount: 1,
        failedThreadIds: ["thread-2"],
      }),
    );
  });
});
