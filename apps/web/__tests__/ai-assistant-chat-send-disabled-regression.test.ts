import type { ModelMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount, getMockMessage } from "@/__tests__/helpers";
import { ActionType } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai ai-assistant-chat-send-disabled-regression

vi.mock("server-only", () => ({}));

const {
  envState,
  mockToolCallAgentStream,
  mockCreateEmailProvider,
  mockPosthogCaptureEvent,
  mockPrisma,
} = vi.hoisted(() => ({
  envState: {
    sendEmailEnabled: false,
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

const logger = createScopedLogger(
  "ai-assistant-chat-send-disabled-regression-test",
);

const conversationMessages: ModelMessage[] = [
  {
    role: "user",
    content: "draft an email to demoinboxzero@outlook.com",
  },
  {
    role: "assistant",
    content:
      "I created a DraftDemo rule that drafts emails to demoinboxzero@outlook.com.",
  },
  {
    role: "user",
    content: "why did you create a rule? I asked for a one-time email",
  },
  {
    role: "assistant",
    content: "I prepared a draft and it is pending confirmation.",
  },
  {
    role: "user",
    content: "do you have a send email tool?",
  },
  {
    role: "assistant",
    content:
      "I cannot send directly. I can only prepare an email pending confirmation.",
  },
  {
    role: "user",
    content: "ok then prepare email",
  },
  {
    role: "assistant",
    content: "I prepared a reply draft.",
  },
  {
    role: "user",
    content: "you did not call that tool",
  },
];

async function loadAssistantChatModule({ emailSend }: { emailSend: boolean }) {
  envState.sendEmailEnabled = emailSend;
  vi.resetModules();
  return await import("@/utils/ai/assistant/chat");
}

async function captureInvocation({
  messages = conversationMessages,
  emailSend = false,
}: {
  messages?: ModelMessage[];
  emailSend?: boolean;
} = {}) {
  const { aiProcessAssistantChat } = await loadAssistantChatModule({
    emailSend,
  });

  mockToolCallAgentStream.mockResolvedValue({
    toUIMessageStreamResponse: vi.fn(),
  });

  await aiProcessAssistantChat({
    messages,
    emailAccountId: "email-account-id",
    user: getEmailAccount(),
    logger,
  });

  return mockToolCallAgentStream.mock.calls[0][0];
}

describe("aiProcessAssistantChat send-disabled transcript regression", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envState.sendEmailEnabled = false;
  });

  it("keeps prompt and tool availability aligned when sending is disabled", async () => {
    const args = await captureInvocation({ emailSend: false });

    expect(args.tools.sendEmail).toBeUndefined();
    expect(args.tools.replyEmail).toBeUndefined();
    expect(args.tools.forwardEmail).toBeUndefined();

    expect(args.messages[0].content).toContain(
      "Email sending actions are disabled in this environment.",
    );
    expect(args.messages[0].content).toContain(
      "sendEmail, replyEmail, and forwardEmail tools are unavailable.",
    );
    expect(args.messages[0].content).toContain(
      "Do not claim that an email was prepared, replied to, forwarded, or sent when send tools are unavailable.",
    );
    expect(args.messages[0].content).not.toContain(
      "Only send emails when the user clearly asks to send now.",
    );

    const getMessagesWithPagination = vi.fn().mockResolvedValue({
      messages: [
        getMockMessage({
          id: "msg-1",
          threadId: "thread-1",
          from: "demoinboxzero@outlook.com",
          to: "user@test.com",
          subject: "hello",
          snippet: "test message",
          labelIds: ["inbox", "unread"],
        }),
      ],
      nextPageToken: undefined,
    });

    mockCreateEmailProvider.mockResolvedValue({
      getMessagesWithPagination,
      getLabels: vi.fn().mockResolvedValue([
        { id: "inbox", name: "Inbox" },
        { id: "unread", name: "Unread" },
      ]),
      archiveThreadWithLabel: vi.fn(),
      markReadThread: vi.fn(),
      bulkArchiveFromSenders: vi.fn(),
    });

    const searchResult = await args.tools.searchInbox.execute({
      query: "demoinboxzero@outlook.com",
      after: undefined,
      before: undefined,
      limit: 20,
      pageToken: undefined,
      inboxOnly: true,
      unreadOnly: false,
    });

    expect(searchResult.totalReturned).toBe(1);
    expect(searchResult.messages[0]).toEqual(
      expect.objectContaining({
        messageId: "msg-1",
        threadId: "thread-1",
      }),
    );

    const updateWithoutRead = await args.tools.updateRuleActions.execute({
      ruleName: "DraftDemo",
      actions: [
        {
          type: ActionType.DRAFT_EMAIL,
          fields: {
            to: "demoinboxzero@outlook.com",
            subject: "test draft",
            content: "hey, just testing out this email draft!",
            label: null,
            cc: null,
            bcc: null,
            webhookUrl: null,
            folderName: null,
          },
          delayInMinutes: null,
        },
      ],
    });

    expect(updateWithoutRead.success).toBe(false);
    expect(updateWithoutRead.error).toContain("call getUserRulesAndSettings");
  });
});
