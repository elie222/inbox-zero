import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { getEmailAccount } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));

const {
  envState,
  mockChatCompletionStream,
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockPrisma,
} = vi.hoisted(() => ({
  envState: {
    sendEmailEnabled: true,
  },
  mockChatCompletionStream: vi.fn(),
  mockCreateEmailProvider: vi.fn(),
  mockPosthogCaptureEvent: vi.fn(),
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
  },
}));

vi.mock("@/utils/llms", () => ({
  chatCompletionStream: mockChatCompletionStream,
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

  mockChatCompletionStream.mockResolvedValue({
    toUIMessageStreamResponse: vi.fn(),
  });

  await aiProcessAssistantChat({
    messages: baseMessages,
    emailAccountId: "email-account-id",
    user,
    logger,
  });

  return mockChatCompletionStream.mock.calls[0][0].tools;
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

    mockChatCompletionStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: baseMessages,
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
    });

    const args = mockChatCompletionStream.mock.calls[0][0];

    expect(args.messages[0].role).toBe("system");
    expect(args.messages[0].content).toContain("Core responsibilities:");
    expect(args.messages[0].content).toContain(
      "Tool usage strategy (progressive disclosure):",
    );
    expect(args.messages[0].content).toContain("Provider context:");
    expect(args.messages[0].content).toContain("Inbox triage guidance:");
    expect(args.messages[0].content).toContain(
      "For conversation status rules, static conditions (from/to/subject) and learned patterns are ignored by the status engine.",
    );
    expect(args.messages[0].content).toContain(
      "It is only used when an action of type DRAFT_EMAIL is used AND the rule has no preset draft content.",
    );
    expect(args.messages[0].content).toContain("<createRule>");
    expect(args.messages[0].content).toContain("<updateAbout>");
    expect(args.messages[0].content).not.toContain("DRAFT_REPLY");
    expect(args.messages[0].content).not.toContain("<create_rule>");
    expect(args.messages[0].content).not.toContain("<update_about>");

    expect(args.tools.getAccountOverview).toBeDefined();
    expect(args.tools.searchInbox).toBeDefined();
    expect(args.tools.manageInbox).toBeDefined();
    expect(args.tools.updateInboxFeatures).toBeDefined();
    expect(args.tools.sendEmail).toBeDefined();
  });

  it("omits sendEmail tool when email sending is disabled", async () => {
    const { aiProcessAssistantChat } = await loadAssistantChatModule({
      emailSend: false,
    });

    mockChatCompletionStream.mockResolvedValue({
      toUIMessageStreamResponse: vi.fn(),
    });

    await aiProcessAssistantChat({
      messages: baseMessages,
      emailAccountId: "email-account-id",
      user: getEmailAccount(),
      logger,
    });

    const args = mockChatCompletionStream.mock.calls[0][0];
    expect(args.tools.sendEmail).toBeUndefined();
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

  it("rejects static-only updates for conversation status rules", async () => {
    const tools = await captureToolSet(true, "google");

    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-to-reply",
      name: "To Reply",
      instructions: "Emails I need to respond to",
      from: null,
      to: null,
      subject: null,
      conditionalOperator: "AND",
      systemType: "TO_REPLY",
    });

    const result = await tools.updateRuleConditions.execute({
      ruleName: "To Reply",
      condition: {
        static: { to: "support@example.com" },
      },
    });

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        ruleId: "rule-to-reply",
      }),
    );
    expect(result.error).toContain("only support aiInstructions updates");
    expect(mockPrisma.rule.update).not.toHaveBeenCalled();
  });

  it("ignores static updates for conversation status rules when aiInstructions is provided", async () => {
    const tools = await captureToolSet(true, "google");

    mockPrisma.rule.findUnique.mockResolvedValue({
      id: "rule-to-reply",
      name: "To Reply",
      instructions: "Emails I need to respond to",
      from: null,
      to: null,
      subject: null,
      conditionalOperator: "AND",
      systemType: "TO_REPLY",
    });
    mockPrisma.rule.update.mockResolvedValue({});

    const result = await tools.updateRuleConditions.execute({
      ruleName: "To Reply",
      condition: {
        aiInstructions:
          "Never mark as To Reply when support@company.com is included.",
        static: { to: "support@company.com" },
        conditionalOperator: "OR",
      },
    });

    expect(mockPrisma.rule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "rule-to-reply" },
        data: {
          instructions:
            "Never mark as To Reply when support@company.com is included.",
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        ruleId: "rule-to-reply",
        note: "Ignored static and conditionalOperator updates for conversation status rule.",
      }),
    );
  });
});
