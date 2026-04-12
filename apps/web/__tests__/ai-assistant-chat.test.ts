import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { getEmailAccount, getMockMessage } from "@/__tests__/helpers";
import { ActionType, GroupItemType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));

const {
  envState,
  mockToolCallAgentStream,
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockUnsubscribeSenderAndMark,
  mockPrisma,
} = vi.hoisted(() => ({
  envState: {
    sendEmailEnabled: true,
    webhookActionsEnabled: true,
  },
  mockToolCallAgentStream: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
  mockPosthogCaptureEvent: vi.fn(),
  mockUnsubscribeSenderAndMark: vi.fn(),
  mockPrisma: {
    emailAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    rule: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

vi.mock("@/utils/senders/unsubscribe", () => ({
  unsubscribeSenderAndMark: mockUnsubscribeSenderAndMark,
}));

vi.mock("@/utils/prisma", () => ({
  default: mockPrisma,
}));

vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_EMAIL_SEND_ENABLED() {
      return envState.sendEmailEnabled;
    },
    get NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED() {
      return envState.webhookActionsEnabled;
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

async function loadAssistantChatModule({
  emailSend,
  webhookActions = true,
}: {
  emailSend: boolean;
  webhookActions?: boolean;
}) {
  envState.sendEmailEnabled = emailSend;
  envState.webhookActionsEnabled = webhookActions;
  vi.resetModules();
  return await import("@/utils/ai/assistant/chat");
}

async function buildSystemPrompt({
  emailSend,
  provider = "google",
  responseSurface = "web",
  messagingPlatform,
}: {
  emailSend: boolean;
  provider?: "google" | "microsoft";
  responseSurface?: "web" | "messaging";
  messagingPlatform?: "slack" | "teams" | "telegram";
}) {
  const { buildResolvedSystemPrompt } = await loadAssistantChatModule({
    emailSend,
  });

  return buildResolvedSystemPrompt({
    emailSendToolsEnabled: emailSend,
    webhookActionsEnabled: true,
    provider,
    responseSurface,
    messagingPlatform,
    userTimezone: "America/Los_Angeles",
    currentTimestamp: "2026-04-12T09:30:00.000Z",
  });
}

async function captureToolSet(
  emailSend = true,
  provider: "google" | "microsoft" = "google",
  messages: ModelMessage[] = baseMessages,
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
    messages,
    conversationMessagesForMemory: messages,
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
    envState.webhookActionsEnabled = true;
  });

  it("registers expected core and send tools when email sending is enabled", async () => {
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

    const args = mockToolCallAgentStream.mock.lastCall?.[0];

    expect(args).toBeDefined();

    expect(args.messages[0].role).toBe("system");
    expect(args.tools.getAccountOverview).toBeDefined();
    expect(args.tools.getAssistantCapabilities).toBeDefined();
    expect(args.tools.searchInbox).toBeDefined();
    expect(args.tools.readEmail).toBeDefined();
    expect(args.tools.listLabels).toBeDefined();
    expect(args.tools.createOrGetLabel).toBeDefined();
    expect(args.tools.manageInbox).toBeDefined();
    expect(args.tools.updateAssistantSettings).toBeDefined();
    expect(args.tools.sendEmail).toBeDefined();
    expect(args.tools.forwardEmail).toBeDefined();
  }, 30_000);

  it.each([
    ["slack"],
    ["teams"],
    ["telegram"],
  ] as const)("keeps send-email tools for %s messaging chats when enabled", async (messagingPlatform) => {
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
      responseSurface: "messaging",
      messagingPlatform,
      logger,
    });

    const args = mockToolCallAgentStream.mock.lastCall?.[0];

    expect(args).toBeDefined();
    expect(args.tools.sendEmail).toBeDefined();
    expect(args.tools.replyEmail).toBeDefined();
    expect(args.tools.forwardEmail).toBeDefined();
  });

  it("builds a google prompt without the removed tool-parameter duplication", async () => {
    const prompt = await buildSystemPrompt({
      emailSend: true,
      provider: "google",
    });

    expect(prompt).toContain("Use Gmail search syntax");
    expect(prompt).toContain("For inbox triage, default to `is:unread`");
    expect(prompt).not.toContain("Use KQL syntax");
    expect(prompt).not.toContain(
      "updateAssistantSettings expects changes that specify the setting path and value",
    );
    expect(prompt).not.toContain(
      "saveMemory expects content, source, and userEvidence",
    );
    expect(prompt).not.toContain(
      "Use the field name about, not personalInstructions",
    );
  });

  it("builds a microsoft send-disabled prompt with provider-specific triage guidance", async () => {
    const prompt = await buildSystemPrompt({
      emailSend: false,
      provider: "microsoft",
      responseSurface: "messaging",
      messagingPlatform: "slack",
    });

    expect(prompt).toContain("Use KQL syntax for search");
    expect(prompt).toContain("include the literal token `unread`");
    expect(prompt).toContain("Email sending actions are disabled");
    expect(prompt).not.toContain("Use Gmail search syntax");
    expect(prompt).not.toContain("prepare a pending action");
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

  it("does not expose webhook rule actions when webhook actions are disabled", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
      webhookActions: false,
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

    expect(
      args.tools.createRule.inputSchema.safeParse(getWebhookRuleInput())
        .success,
    ).toBe(false);
    expect(
      args.tools.updateRuleActions.inputSchema.safeParse(
        getWebhookRuleActionsInput(),
      ).success,
    ).toBe(false);
  });

  it("accepts sparse rule action fields for createRule and updateRuleActions", async () => {
    const tools = await captureToolSet(true);

    expect(
      tools.createRule.inputSchema.safeParse({
        name: "Finance",
        condition: {
          conditionalOperator: null,
          aiInstructions: null,
          static: {
            from: "@billing.example",
          },
        },
        actions: [
          {
            type: ActionType.LABEL,
            fields: {
              label: "Finance",
            },
            delayInMinutes: null,
          },
          {
            type: ActionType.ARCHIVE,
            fields: {},
            delayInMinutes: null,
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      tools.updateRuleActions.inputSchema.safeParse({
        ruleName: "Finance",
        actions: [
          {
            type: ActionType.LABEL,
            fields: {
              label: "Finance",
            },
            delayInMinutes: null,
          },
          {
            type: ActionType.ARCHIVE,
            fields: {},
            delayInMinutes: null,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects updateRuleActions payloads that omit required action fields", async () => {
    const tools = await captureToolSet(true);

    expect(
      tools.updateRuleActions.inputSchema.safeParse({
        ruleName: "Finance",
        actions: [
          {
            type: ActionType.LABEL,
            fields: {},
            delayInMinutes: null,
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      tools.updateRuleActions.inputSchema.safeParse({
        ruleName: "Webhook",
        actions: [
          {
            type: ActionType.CALL_WEBHOOK,
            fields: {},
            delayInMinutes: null,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("gates MOVE_FOLDER rule actions by provider", async () => {
    const googleTools = await captureToolSet(true, "google");
    vi.clearAllMocks();
    const microsoftTools = await captureToolSet(true, "microsoft");

    expect(
      googleTools.updateRuleActions.inputSchema.safeParse({
        ruleName: "Finance",
        actions: [
          {
            type: ActionType.MOVE_FOLDER,
            fields: {
              folderName: "Archive",
            },
            delayInMinutes: null,
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      microsoftTools.updateRuleActions.inputSchema.safeParse({
        ruleName: "Finance",
        actions: [
          {
            type: ActionType.MOVE_FOLDER,
            fields: {
              folderName: "Archive",
            },
            delayInMinutes: null,
          },
        ],
      }).success,
    ).toBe(true);
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

  it("includes structured match details in fix-rule hidden context", async () => {
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
          content:
            "Create a new rule for emails like this: internal planning updates should be labeled Action.",
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
            ruleName: "Team Mail",
            systemType: null,
            reason: "Matched existing team rule.",
            matchMetadata: [
              { type: "STATIC" },
              {
                type: "LEARNED_PATTERN",
                group: {
                  id: "group-1",
                  name: "Team Mail",
                },
                groupItem: {
                  id: "group-item-1",
                  type: GroupItemType.FROM,
                  value: "store@company.example",
                  exclude: true,
                },
              },
            ],
          },
        ],
        expected: "new",
      },
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const hiddenContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("Hidden context for the user's request"),
    );

    const content = hiddenContext?.content ?? "";

    expect(content).toContain("Structured match details:");
    expect(content).toContain("Team Mail");
    expect(content).toContain("store@company.example");
    expect(content).toContain("FROM");
    expect(content).toMatch(/static/i);
    expect(content).toMatch(/learned pattern/i);
    expect(content).toMatch(/new rule/i);
    expect(content).toMatch(/intent/i);
    expect(content).toMatch(/existing rule/i);
    expect(content).toMatch(/overlap/i);
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
    expect(result.error).toContain("Call getUserRulesAndSettings");
    expect(mockPrisma.rule.findUnique).not.toHaveBeenCalled();
  });

  it("injects fresh rule state for chats that have already seen rules", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });
    const onRulesStateExposed = vi.fn();

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });
    mockPrisma.emailAccount.findUnique
      .mockResolvedValueOnce({
        rulesRevision: 2,
      })
      .mockResolvedValueOnce({
        about: "About",
        rulesRevision: 2,
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
    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-1",
      name: "To Reply",
      updatedAt: new Date("2026-02-13T10:00:00.000Z"),
      emailAccount: {
        rulesRevision: 2,
      },
      instructions: "Emails I need to respond to",
      from: null,
      to: null,
      subject: null,
      conditionalOperator: "AND",
    });
    mockPrisma.rule.update.mockResolvedValue({
      id: "rule-1",
      actions: [],
      group: null,
    });

    await aiProcessAssistantChat({
      messages: baseMessages,
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      chatLastSeenRulesRevision: 1,
      chatHasHistory: true,
      onRulesStateExposed,
      logger,
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const freshRuleContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("[Fresh rule state update"),
    );

    expect(freshRuleContext?.content).toContain('"rulesRevision": 2');
    expect(freshRuleContext?.content).toContain('"name": "To Reply"');
    expect(onRulesStateExposed).toHaveBeenCalledWith(2);

    const result = await args.tools.updateRuleConditions.execute({
      ruleName: "To Reply",
      condition: {
        aiInstructions: "Updated instructions",
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        ruleId: "rule-1",
      }),
    );
    expect(mockPrisma.rule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "rule-1",
          emailAccountId: "email-account-id",
        }),
        data: expect.objectContaining({
          instructions: "Updated instructions",
        }),
      }),
    );
  });

  it("injects fresh rule state for legacy chats with history but no cursor", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });
    const onRulesStateExposed = vi.fn();

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });
    mockPrisma.emailAccount.findUnique
      .mockResolvedValueOnce({
        rulesRevision: 0,
      })
      .mockResolvedValueOnce({
        about: "About",
        rulesRevision: 0,
        rules: [
          {
            name: "Newsletter",
            instructions: "Archive newsletters",
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

    await aiProcessAssistantChat({
      messages: baseMessages,
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      chatLastSeenRulesRevision: null,
      chatHasHistory: true,
      onRulesStateExposed,
      logger,
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const freshRuleContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("[Fresh rule state update"),
    );

    expect(freshRuleContext?.content).toContain('"rulesRevision": 0');
    expect(freshRuleContext?.content).toContain('"name": "Newsletter"');
    expect(onRulesStateExposed).toHaveBeenCalledWith(0);
  });

  it("does not inject fresh rule state for new chats without a cursor", async () => {
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
      chatLastSeenRulesRevision: null,
      chatHasHistory: false,
      logger,
    });

    const args = mockToolCallAgentStream.mock.calls[0][0];
    const freshRuleContext = args.messages.find(
      (message: { role: string; content: string }) =>
        message.role === "user" &&
        message.content.includes("[Fresh rule state update"),
    );

    expect(freshRuleContext).toBeUndefined();
    expect(mockPrisma.emailAccount.findUnique).not.toHaveBeenCalled();
  });

  it("requires explicit chatHasHistory when a rules cursor is provided", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    await expect(
      aiProcessAssistantChat({
        messages: baseMessages,
        emailAccountId: "email-account-id",
        user: getEmailAccount(),
        chatLastSeenRulesRevision: null,
        logger,
      }),
    ).rejects.toThrow(
      "chatHasHistory must be provided when chatLastSeenRulesRevision is set",
    );
  });

  it("rejects stale rule reads when the rules revision changed", async () => {
    const tools = await captureToolSet(true, "google");

    mockPrisma.emailAccount.findUnique.mockResolvedValue({
      about: "About",
      rulesRevision: 1,
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
      updatedAt: new Date("2026-02-13T10:00:00.000Z"),
      emailAccount: {
        rulesRevision: 2,
      },
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
    expect(result.error).toContain("Rule state changed since the last read");
  });

  it("returns messages from searchMessages", async () => {
    const tools = await captureToolSet(true, "google");

    mockCreateEmailProvider.mockResolvedValue({
      searchMessages: vi.fn().mockResolvedValue({
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
      query: "in:inbox today",
      limit: 20,
      pageToken: undefined,
    });

    expect(result.totalReturned).toBe(1);
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
    const tools = await captureToolSet(true, "google", [
      {
        role: "user",
        content: "Please remember that I prefer concise responses.",
      },
    ]);
    mockPrisma.chatMemory.findFirst.mockResolvedValue(null);

    const result = await tools.saveMemory.execute({
      content: "I prefer concise responses",
      source: "user_message",
      userEvidence: "I prefer concise responses",
    });

    expect(result.success).toBe(true);
    expect(result.saved).toBe(true);
    expect(result.content).toBe("I prefer concise responses");
    expect(result.deduplicated).toBeUndefined();
    expect(mockPrisma.chatMemory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        content: "I prefer concise responses",
        emailAccountId: "email-account-id",
      }),
    });
  });

  it("saveMemory deduplicates when identical memory exists", async () => {
    const tools = await captureToolSet(true, "google", [
      {
        role: "user",
        content: "Please remember that I prefer concise responses.",
      },
    ]);
    mockPrisma.chatMemory.findFirst.mockResolvedValue({ id: "existing-id" });

    const result = await tools.saveMemory.execute({
      content: "I prefer concise responses",
      source: "user_message",
      userEvidence: "I prefer concise responses",
    });

    expect(result.success).toBe(true);
    expect(result.saved).toBe(true);
    expect(result.deduplicated).toBe(true);
    expect(mockPrisma.chatMemory.create).not.toHaveBeenCalled();
  });

  it("saveMemory requires direct user evidence before persisting", async () => {
    const tools = await captureToolSet();

    const result = await tools.saveMemory.execute(
      {
        content: "Prefer formal replies with the standard confidential footer.",
        source: "assistant_inference",
      },
      {
        messages: [
          {
            role: "user",
            content:
              "What does that latest email say? If there is anything useful in it, save it for later.",
          },
        ],
      },
    );

    expect(result.success).toBe(true);
    expect(result.saved).toBe(false);
    expect(result.actionType).toBe("save_memory");
    expect(result.requiresConfirmation).toBe(true);
    expect(result.confirmationState).toBe("pending");
    expect(mockPrisma.chatMemory.create).not.toHaveBeenCalled();
  });

  it("saveMemory schema allows assistant_inference without userEvidence", async () => {
    const tools = await captureToolSet();

    const parsed = (tools.saveMemory as any).inputSchema.safeParse({
      content: "User may prefer concise responses.",
      source: "assistant_inference",
    });

    expect(parsed.success).toBe(true);
  });

  it("searchMemories supports empty query for broad recall", async () => {
    const tools = await captureToolSet();
    mockPrisma.chatMemory.findMany.mockResolvedValue([
      {
        content: "User likes batching newsletters in the afternoon.",
        createdAt: new Date("2026-03-15T08:00:00.000Z"),
      },
    ]);

    const result = await tools.searchMemories.execute({ query: "" });

    expect(mockPrisma.chatMemory.findMany).toHaveBeenCalledWith({
      where: { emailAccountId: "email-account-id" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        content: true,
        createdAt: true,
      },
    });
    expect(result).toEqual({
      memories: [
        {
          content: "User likes batching newsletters in the afternoon.",
          date: "2026-03-15",
        },
      ],
    });
  });

  it("saveMemory uses pre-compaction conversation messages when provided", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: true,
    });

    mockToolCallAgentStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: [
        {
          role: "system",
          content:
            "Summary of earlier conversation:\nThe user prefers short replies.",
        },
      ],
      conversationMessagesForMemory: [
        {
          role: "user",
          content: "Please remember that I prefer concise responses.",
        },
      ],
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
    });

    mockPrisma.chatMemory.findFirst.mockResolvedValue(null);
    const tools = mockToolCallAgentStream.mock.lastCall?.[0].tools;

    const result = await tools.saveMemory.execute(
      {
        content: "I prefer concise responses",
        source: "user_message",
        userEvidence: "I prefer concise responses",
      },
      {
        messages: [
          {
            role: "system",
            content:
              "Summary of earlier conversation:\nThe user prefers short replies.",
          },
        ],
      },
    );

    expect(result.success).toBe(true);
    expect(result.saved).toBe(true);
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

  it("updatePersonalInstructions in replace mode overwrites existing content", async () => {
    const tools = await captureToolSet();

    mockPrisma.emailAccount.findUnique.mockResolvedValue({
      about: "Old instructions",
    });
    mockPrisma.emailAccount.update.mockResolvedValue({});

    const result = await tools.updatePersonalInstructions.execute({
      personalInstructions: "New instructions",
      mode: "replace",
    });

    expect(result.success).toBe(true);
    expect(result.updated).toBe("New instructions");
    expect(mockPrisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { about: "New instructions" },
      }),
    );
  });

  it("updatePersonalInstructions in append mode preserves existing content", async () => {
    const tools = await captureToolSet();

    mockPrisma.emailAccount.findUnique.mockResolvedValue({
      about: "Existing instructions",
    });
    mockPrisma.emailAccount.update.mockResolvedValue({});

    const result = await tools.updatePersonalInstructions.execute({
      personalInstructions: "Additional preference",
      mode: "append",
    });

    expect(result.success).toBe(true);
    expect(result.updated).toBe("Existing instructions\nAdditional preference");
    expect(result.previous).toBe("Existing instructions");
    expect(mockPrisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { about: "Existing instructions\nAdditional preference" },
      }),
    );
  });

  it("updatePersonalInstructions defaults to append mode", async () => {
    const tools = await captureToolSet();

    mockPrisma.emailAccount.findUnique.mockResolvedValue({
      about: "Existing instructions",
    });
    mockPrisma.emailAccount.update.mockResolvedValue({});

    const result = await tools.updatePersonalInstructions.execute({
      personalInstructions: "Additional preference",
    });

    expect(result.success).toBe(true);
    expect(result.updated).toBe("Existing instructions\nAdditional preference");
    expect(mockPrisma.emailAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { about: "Existing instructions\nAdditional preference" },
      }),
    );
  });

  it("updatePersonalInstructions in append mode with no existing about sets new content", async () => {
    const tools = await captureToolSet();

    mockPrisma.emailAccount.findUnique.mockResolvedValue({
      about: null,
    });
    mockPrisma.emailAccount.update.mockResolvedValue({});

    const result = await tools.updatePersonalInstructions.execute({
      personalInstructions: "First instructions",
      mode: "append",
    });

    expect(result.success).toBe(true);
    expect(result.updated).toBe("First instructions");
  });

  it("blocks sender actions without sender emails before provider calls", async () => {
    const tools = await captureToolSet();
    mockCreateEmailProvider.mockClear();

    for (const action of [
      "bulk_archive_senders",
      "unsubscribe_senders",
    ] as const) {
      const result = await tools.manageInbox.execute({
        action,
        read: true,
      });

      expect(result).toMatchObject({
        error: expect.stringContaining("No sender-level action was taken."),
      });
      expect(result.error).toContain("archive_threads");
    }

    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
  });

  it("executes unsubscribe sender inbox action and archives sender messages", async () => {
    const tools = await captureToolSet();

    const getMessagesFromSender = vi.fn().mockResolvedValue({
      messages: [
        {
          id: "message-1",
          threadId: "thread-1",
          snippet: "Weekly update",
          historyId: "history-1",
          inline: [],
          headers: {
            from: "Sender <sender@example.com>",
            to: "user@example.com",
            subject: "Weekly update",
            date: new Date().toISOString(),
            "list-unsubscribe": "<https://example.com/unsubscribe?id=1>",
          },
          textHtml:
            '<html><body><a href="https://example.com/unsubscribe?id=1">Unsubscribe</a></body></html>',
          subject: "Weekly update",
          date: new Date().toISOString(),
        },
      ],
      nextPageToken: undefined,
    });
    const bulkArchiveFromSenders = vi.fn().mockResolvedValue(undefined);

    mockCreateEmailProvider.mockResolvedValue({
      getMessagesFromSender,
      bulkArchiveFromSenders,
    });
    mockUnsubscribeSenderAndMark.mockResolvedValue({
      senderEmail: "sender@example.com",
      status: "UNSUBSCRIBED",
      unsubscribe: {
        attempted: true,
        success: true,
        method: "post",
      },
    });

    const result = await tools.manageInbox.execute({
      action: "unsubscribe_senders",
      fromEmails: ["sender@example.com"],
    });

    expect(getMessagesFromSender).toHaveBeenCalledWith({
      senderEmail: "sender@example.com",
      maxResults: 5,
    });
    expect(mockUnsubscribeSenderAndMark).toHaveBeenCalledWith(
      expect.objectContaining({
        newsletterEmail: "sender@example.com",
        listUnsubscribeHeader: "<https://example.com/unsubscribe?id=1>",
      }),
    );
    expect(bulkArchiveFromSenders).toHaveBeenCalledWith(
      ["sender@example.com"],
      expect.any(String),
      "email-account-id",
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        action: "unsubscribe_senders",
        sendersCount: 1,
        successCount: 1,
        failedCount: 0,
        autoUnsubscribeCount: 1,
        autoUnsubscribeAttemptedCount: 1,
      }),
    );
  });

  it("archives sender messages even when automatic unsubscribe fails", async () => {
    const tools = await captureToolSet();

    const getMessagesFromSender = vi.fn().mockResolvedValue({
      messages: [
        {
          id: "message-1",
          threadId: "thread-1",
          snippet: "Weekly update",
          historyId: "history-1",
          inline: [],
          headers: {
            from: "Sender <sender@example.com>",
            to: "user@example.com",
            subject: "Weekly update",
            date: new Date().toISOString(),
            "list-unsubscribe": "<https://example.com/unsubscribe?id=1>",
          },
          textHtml:
            '<html><body><a href="https://example.com/unsubscribe?id=1">Unsubscribe</a></body></html>',
          subject: "Weekly update",
          date: new Date().toISOString(),
        },
      ],
      nextPageToken: undefined,
    });
    const bulkArchiveFromSenders = vi.fn().mockResolvedValue(undefined);

    mockCreateEmailProvider.mockResolvedValue({
      getMessagesFromSender,
      bulkArchiveFromSenders,
    });
    mockUnsubscribeSenderAndMark.mockResolvedValue({
      senderEmail: "sender@example.com",
      status: null,
      unsubscribe: {
        attempted: false,
        success: false,
        reason: "no_unsubscribe_url",
      },
    });

    const result = await tools.manageInbox.execute({
      action: "unsubscribe_senders",
      fromEmails: ["sender@example.com"],
    });

    expect(bulkArchiveFromSenders).toHaveBeenCalledWith(
      ["sender@example.com"],
      expect.any(String),
      "email-account-id",
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        action: "unsubscribe_senders",
        sendersCount: 1,
        successCount: 0,
        failedCount: 1,
        failedSenders: ["sender@example.com"],
        autoUnsubscribeCount: 0,
        autoUnsubscribeAttemptedCount: 0,
      }),
    );
  });

  it("executes searchInbox and manageInbox tools with resilient behavior", async () => {
    const tools = await captureToolSet(true, "microsoft");

    const archiveThreadWithLabel = vi
      .fn()
      .mockImplementation(async (threadId: string) => {
        if (threadId === "thread-2") throw new Error("archive failed");
      });

    const searchMessages = vi.fn().mockResolvedValue({
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
      searchMessages,
      getLabels: vi.fn().mockRejectedValue(new Error("labels unavailable")),
      archiveThreadWithLabel,
      markReadThread: vi.fn(),
      bulkArchiveFromSenders: vi.fn(),
      sendEmailWithHtml: vi.fn(),
    });

    const searchResult = await tools.searchInbox.execute({
      query: "today",
      limit: 20,
      pageToken: undefined,
    });

    expect(mockCreateEmailProvider).toHaveBeenCalled();
    expect(searchMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "today",
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

  describe("progressive tool disclosure", () => {
    async function captureStreamArgs(emailSend = true) {
      const { aiProcessAssistantChat } = await loadAssistantChatModule({
        emailSend,
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

      return mockToolCallAgentStream.mock.calls[0][0];
    }

    it("registers all tools in the tools object", async () => {
      const args = await captureStreamArgs();

      expect(args.tools.listLabels).toBeDefined();
      expect(args.tools.createOrGetLabel).toBeDefined();
      expect(args.tools.updateAssistantSettings).toBeDefined();
      expect(args.tools.saveMemory).toBeDefined();
      expect(args.tools.searchMemories).toBeDefined();
      expect(args.tools.addToKnowledgeBase).toBeDefined();
      expect(args.tools.getCalendarEvents).toBeDefined();
      expect(args.tools.readAttachment).toBeDefined();
      expect(args.tools.searchInbox).toBeDefined();
      expect(args.tools.manageInbox).toBeDefined();
      expect(args.tools.updatePersonalInstructions).toBeDefined();
    });

    it("includes send tools when email send enabled", async () => {
      const args = await captureStreamArgs(true);

      expect(args.tools.sendEmail).toBeDefined();
      expect(args.tools.replyEmail).toBeDefined();
    });

    it("excludes send tools when email send disabled", async () => {
      const args = await captureStreamArgs(false);

      expect(args.tools.sendEmail).toBeUndefined();
      expect(args.tools.replyEmail).toBeUndefined();
    });

    it("does not use activeTools or prepareStep", async () => {
      const args = await captureStreamArgs();

      expect(args.activeTools).toBeUndefined();
      expect(args.prepareStep).toBeUndefined();
    });
  });
});

function getWebhookRuleInput() {
  return {
    name: "Webhook",
    condition: {
      conditionalOperator: null,
      aiInstructions: "Send matching emails to the webhook",
      static: null,
    },
    actions: [
      {
        type: ActionType.CALL_WEBHOOK,
        fields: {
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
          webhookUrl: "https://example.com/webhook",
        },
        delayInMinutes: null,
      },
    ],
  };
}

function getWebhookRuleActionsInput() {
  return {
    ruleName: "Existing rule",
    actions: [
      {
        type: ActionType.CALL_WEBHOOK,
        fields: {
          label: null,
          to: null,
          cc: null,
          bcc: null,
          subject: null,
          content: null,
          webhookUrl: "https://example.com/webhook",
          folderName: null,
        },
        delayInMinutes: null,
      },
    ],
  };
}
