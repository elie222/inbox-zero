import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  ActionType,
  AttachmentSourceType,
  MessagingMessageStatus,
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import type { ParsedMessage } from "@/utils/types";

vi.mock("@/utils/prisma");

const mockCreateEmailProvider = vi.fn();
const mockSendAutomationMessage = vi.fn();
const mockSlackPostMessage = vi.fn();
const mockSlackUpdate = vi.fn();
const mockSlackJoin = vi.fn();
const mockTeamsOpenDm = vi.fn();
const mockTeamsEditMessage = vi.fn();
const mockTelegramOpenDm = vi.fn();
const mockTelegramPostMessage = vi.fn();
const mockTelegramEditMessage = vi.fn();
const logger = createTestLogger();

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => mockCreateEmailProvider(...args),
}));

vi.mock("@/utils/automation-jobs/messaging", () => ({
  sendAutomationMessage: (...args: unknown[]) =>
    mockSendAutomationMessage(...args),
}));

vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: () => ({
    chat: {
      postMessage: (...args: unknown[]) => mockSlackPostMessage(...args),
      update: (...args: unknown[]) => mockSlackUpdate(...args),
    },
    conversations: {
      join: (...args: unknown[]) => mockSlackJoin(...args),
    },
  }),
}));

vi.mock("@/utils/messaging/chat-sdk/adapters", () => ({
  getMessagingAdapterRegistry: () => ({
    adapters: {},
    typedAdapters: {
      teams: {
        openDM: (...args: unknown[]) => mockTeamsOpenDm(...args),
        editMessage: (...args: unknown[]) => mockTeamsEditMessage(...args),
      },
      telegram: {
        openDM: (...args: unknown[]) => mockTelegramOpenDm(...args),
        postMessage: (...args: unknown[]) => mockTelegramPostMessage(...args),
        editMessage: (...args: unknown[]) => mockTelegramEditMessage(...args),
      },
    },
  }),
}));

describe("handleRuleNotificationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAutomationMessage.mockResolvedValue({
      channelId: "teams-thread-1",
      messageId: "teams-message-1",
    });
    mockSlackPostMessage.mockResolvedValue({ ts: "slack-ts-1" });
    mockSlackUpdate.mockResolvedValue({});
    mockSlackJoin.mockResolvedValue({});
    mockTeamsOpenDm.mockResolvedValue("teams-thread-1");
    mockTeamsEditMessage.mockResolvedValue({ id: "teams-message-1" });
    mockTelegramOpenDm.mockResolvedValue("telegram-thread-1");
    mockTelegramPostMessage.mockResolvedValue({ id: "telegram-message-1" });
    mockTelegramEditMessage.mockResolvedValue({ id: "telegram-message-1" });
  });

  it("keeps the draft preview visible after sending from Slack", async () => {
    const provider = {
      sendDraft: vi.fn().mockResolvedValue(undefined),
      getDraft: vi.fn().mockResolvedValue({
        id: "draft-1",
        threadId: "thread-1",
        textPlain:
          'Thanks for the note.\n\nTry opening the &quot;Test&quot; tab.\n\nDrafted by <a href="https://getinboxzero.com/?ref=ABC">Inbox Zero</a>.',
        subject: "Re: Test subject",
        date: new Date().toISOString(),
        snippet: "Thanks for the note.",
        historyId: "1",
        internalDate: "1",
        headers: {
          from: "user@example.com",
          to: "sender@example.com",
          subject: "Re: Test subject",
          date: "Mon, 1 Jan 2024 12:00:00 +0000",
        },
        labelIds: [],
        inline: [],
      } satisfies ParsedMessage),
      getMessage: vi.fn().mockResolvedValue({
        id: "message-1",
        threadId: "thread-1",
        textPlain: "Original message body",
        textHtml: "<p>Original message body</p>",
        subject: "Test subject",
        date: new Date().toISOString(),
        snippet: "Original message body",
        historyId: "2",
        internalDate: "2",
        headers: {
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Test subject",
          date: "Mon, 1 Jan 2024 11:00:00 +0000",
          "message-id": "<message-1@example.com>",
        },
        attachments: [],
        labelIds: [],
        inline: [],
      } satisfies ParsedMessage),
    };

    mockCreateEmailProvider.mockResolvedValue(provider);

    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content:
        'Thanks for the note.\n\nTry opening the &quot;Test&quot; tab.\n\nDrafted by <a href="https://getinboxzero.com/?ref=ABC">Inbox Zero</a>.',
      mailboxDraftAction: {
        id: "draft-action-1",
        draftId: "draft-1",
        subject: "Re: Test subject",
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const editMessage = vi.fn().mockResolvedValue(undefined);
    const event = createSlackActionEvent({
      actionId: "rule_draft_send",
      value: "action-1",
      editMessage,
    });

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger,
    });

    expect(provider.sendDraft).toHaveBeenCalledWith("draft-1");
    expect(editMessage).toHaveBeenCalledTimes(1);

    const [, , card] = editMessage.mock.calls[0];
    const cardText = JSON.stringify(card);

    expect(cardText).toContain("I drafted a reply for you");
    expect(cardText).not.toContain("📩 You got an email");
    expect(cardText).toContain("*sender@example.com*");
    expect(cardText).toContain("*Subject:* Test subject");
    expect(cardText).toContain("They wrote:");
    expect(cardText).toContain("Original message body");
    expect(cardText).toContain("I drafted a reply for you:");
    expect(cardText).toContain('Try opening the \\"Test\\" tab.');
    expect(cardText).toContain(
      "Drafted by <https://getinboxzero.com/?ref=ABC|Inbox Zero>.",
    );
    expect(cardText).toContain("Status: Reply sent.");
    expect(cardText).toContain("Open in Gmail");
    expect(cardText).toContain(
      "https://mail.google.com/mail/u/?authuser=user%40example.com#all/message-1",
    );
  });

  it("sends Telegram draft replies from the notification Send button", async () => {
    const provider = {
      sendDraft: vi.fn().mockResolvedValue(undefined),
      getDraft: vi.fn().mockResolvedValue({
        id: "draft-1",
        threadId: "thread-1",
        textPlain: "Thanks for checking in.",
        subject: "Re: Test subject",
        date: new Date().toISOString(),
        snippet: "Thanks for checking in.",
        historyId: "1",
        internalDate: "1",
        headers: {
          from: "user@example.com",
          to: "sender@example.com",
          subject: "Re: Test subject",
          date: "Mon, 1 Jan 2024 12:00:00 +0000",
        },
        labelIds: [],
        inline: [],
      } satisfies ParsedMessage),
      getMessage: vi.fn().mockResolvedValue({
        id: "message-1",
        threadId: "thread-1",
        textPlain: "Original message body",
        textHtml: "<p>Original message body</p>",
        subject: "Test subject",
        date: new Date().toISOString(),
        snippet: "Original message body",
        historyId: "2",
        internalDate: "2",
        headers: {
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Test subject",
          date: "Mon, 1 Jan 2024 11:00:00 +0000",
          "message-id": "<message-1@example.com>",
        },
        attachments: [],
        labelIds: [],
        inline: [],
      } satisfies ParsedMessage),
    };

    mockCreateEmailProvider.mockResolvedValue(provider);

    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Thanks for checking in.",
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TELEGRAM,
        isConnected: true,
        teamId: "telegram-chat-1",
        providerUserId: "telegram-user-1",
        accessToken: null,
        channelId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
            targetId: "telegram-chat-1",
            targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          },
        ],
      },
      mailboxDraftAction: {
        id: "draft-action-1",
        draftId: "draft-1",
        subject: "Re: Test subject",
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const editMessage = vi.fn().mockResolvedValue(undefined);
    const event = createTelegramActionEvent({ editMessage });

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger,
    });

    expect(provider.sendDraft).toHaveBeenCalledWith("draft-1");
    expect(editMessage).toHaveBeenCalledTimes(1);

    const [, , card] = editMessage.mock.calls[0];
    const cardText = JSON.stringify(card);

    expect(cardText).toContain("Status: Reply sent.");
    expect(cardText).toContain("Open in Gmail");
  });

  it("authorizes Telegram send actions against the notification route target", async () => {
    const provider = {
      sendDraft: vi.fn().mockResolvedValue(undefined),
      getDraft: vi.fn().mockResolvedValue({
        id: "draft-1",
        threadId: "thread-1",
        textPlain: "Thanks for checking in.",
        subject: "Re: Test subject",
        date: new Date().toISOString(),
        snippet: "Thanks for checking in.",
        historyId: "1",
        internalDate: "1",
        headers: {
          from: "user@example.com",
          to: "sender@example.com",
          subject: "Re: Test subject",
          date: "Mon, 1 Jan 2024 12:00:00 +0000",
        },
        labelIds: [],
        inline: [],
      } satisfies ParsedMessage),
      getMessage: vi.fn().mockResolvedValue({
        id: "message-1",
        threadId: "thread-1",
        textPlain: "Original message body",
        textHtml: "<p>Original message body</p>",
        subject: "Test subject",
        date: new Date().toISOString(),
        snippet: "Original message body",
        historyId: "2",
        internalDate: "2",
        headers: {
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Test subject",
          date: "Mon, 1 Jan 2024 11:00:00 +0000",
          "message-id": "<message-1@example.com>",
        },
        attachments: [],
        labelIds: [],
        inline: [],
      } satisfies ParsedMessage),
    };

    mockCreateEmailProvider.mockResolvedValue(provider);

    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Thanks for checking in.",
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TELEGRAM,
        isConnected: true,
        teamId: "telegram-workspace-id",
        providerUserId: "telegram-user-1",
        accessToken: null,
        channelId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
            targetId: "telegram-chat-1",
            targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          },
        ],
      },
      mailboxDraftAction: {
        id: "draft-action-1",
        draftId: "draft-1",
        subject: "Re: Test subject",
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const editMessage = vi.fn().mockResolvedValue(undefined);
    const event = createTelegramActionEvent({ editMessage });

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger,
    });

    expect(provider.sendDraft).toHaveBeenCalledWith("draft-1");
    expect(editMessage).toHaveBeenCalledTimes(1);
  });

  it("moves Slack notification messages to trash from the More menu", async () => {
    const provider = {
      trashThread: vi.fn().mockResolvedValue(undefined),
    };

    mockCreateEmailProvider.mockResolvedValue(provider);
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
    });

    const editMessage = vi.fn().mockResolvedValue(undefined);
    const event = createSlackActionEvent({
      actionId: "rule_notify_more",
      value: "rule_notify_trash:action-1",
      editMessage,
    });

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger,
    });

    expect(provider.trashThread).toHaveBeenCalledWith(
      "thread-1",
      "user@example.com",
      "user",
    );
    expect(editMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(editMessage.mock.calls[0][2])).toContain(
      "Moved to trash.",
    );
  });

  it("marks Slack notification messages as spam from the More menu", async () => {
    const provider = {
      markSpam: vi.fn().mockResolvedValue(undefined),
    };

    mockCreateEmailProvider.mockResolvedValue(provider);
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
    });

    const editMessage = vi.fn().mockResolvedValue(undefined);
    const event = createSlackActionEvent({
      actionId: "rule_notify_more",
      value: "rule_notify_mark_spam:action-1",
      editMessage,
    });

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger,
    });

    expect(provider.markSpam).toHaveBeenCalledWith("thread-1");
    expect(editMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(editMessage.mock.calls[0][2])).toContain(
      "Marked as spam.",
    );
  });

  it("dismisses Slack notification messages", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
    });

    const editMessage = vi.fn().mockResolvedValue(undefined);
    const event = createSlackActionEvent({
      actionId: "rule_draft_dismiss",
      value: "action-1",
      editMessage,
    });

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger,
    });

    expect(prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        messagingMessageStatus: MessagingMessageStatus.DISMISSED,
      },
    });
    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
    expect(editMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(editMessage.mock.calls[0][2])).toContain(
      "Email notification",
    );
    expect(JSON.stringify(editMessage.mock.calls[0][2])).toContain(
      "Dismissed.",
    );
  });

  it("rejects unsupported Slack More menu selections before loading context", async () => {
    const postEphemeral = vi.fn().mockResolvedValue(undefined);
    const event = createSlackActionEvent({
      actionId: "rule_notify_more",
      value: "rule_notify_archive:action-1",
      postEphemeral,
    });

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger,
    });

    expect(prisma.executedAction.findUnique).not.toHaveBeenCalled();
    expect(mockCreateEmailProvider).not.toHaveBeenCalled();
    expect(postEphemeral).toHaveBeenCalledWith(
      event.user,
      "That notification is invalid or expired.",
      { fallbackToDM: false },
    );
  });

  it("supports legacy direct destructive Slack action IDs", async () => {
    const provider = {
      trashThread: vi.fn().mockResolvedValue(undefined),
    };

    mockCreateEmailProvider.mockResolvedValue(provider);
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
    });

    const editMessage = vi.fn().mockResolvedValue(undefined);
    const event = createSlackActionEvent({
      actionId: "rule_notify_trash",
      value: "action-1",
      editMessage,
    });

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger,
    });

    expect(provider.trashThread).toHaveBeenCalledWith(
      "thread-1",
      "user@example.com",
      "user",
    );
    expect(editMessage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(editMessage.mock.calls[0][2])).toContain(
      "Moved to trash.",
    );
  });
});

describe("buildNotificationReplySendBody", () => {
  it("includes the formatted sender when provided", async () => {
    const { buildNotificationReplySendBody } = await import(
      "./rule-notifications"
    );

    const body = buildNotificationReplySendBody({
      sourceMessage: {
        id: "message-1",
        threadId: "thread-1",
        headers: {
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Test subject",
          date: "Mon, 1 Jan 2024 11:00:00 +0000",
          "message-id": "<message-1@example.com>",
        },
      } as ParsedMessage,
      fallbackThreadId: "thread-fallback",
      content: "Thanks for checking in.",
      formattedFrom: "Elie Steinbock <elie@getinboxzero.com>",
      attachments: [],
    });

    expect(body).toEqual(
      expect.objectContaining({
        from: "Elie Steinbock <elie@getinboxzero.com>",
      }),
    );
  });

  it("falls back to the stored thread id when the source message omits it", async () => {
    const { buildNotificationReplySendBody } = await import(
      "./rule-notifications"
    );

    const body = buildNotificationReplySendBody({
      sourceMessage: {
        id: "message-1",
        threadId: "",
        headers: {
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Test subject",
          date: "Mon, 1 Jan 2024 11:00:00 +0000",
          "message-id": "<message-1@example.com>",
        },
      } as ParsedMessage,
      fallbackThreadId: "thread-1",
      content: "Thanks for checking in.",
      attachments: [],
    });

    expect(body).toEqual(
      expect.objectContaining({
        replyToEmail: expect.objectContaining({
          threadId: "thread-1",
        }),
      }),
    );
  });
});

describe("sendMessagingRuleNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAutomationMessage.mockResolvedValue({
      channelId: "teams-thread-1",
      messageId: "teams-message-1",
    });
    mockSlackPostMessage.mockResolvedValue({ ts: "slack-ts-1" });
    mockSlackJoin.mockResolvedValue({});
    mockTeamsOpenDm.mockResolvedValue("teams-thread-1");
    mockTeamsEditMessage.mockResolvedValue({ id: "teams-message-1" });
    mockTelegramOpenDm.mockResolvedValue("telegram-thread-1");
    mockTelegramPostMessage.mockResolvedValue({ id: "telegram-message-1" });
    mockTelegramEditMessage.mockResolvedValue({ id: "telegram-message-1" });
  });

  it("adds an Open in Gmail button for Slack draft notifications on Google accounts", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("Open in Gmail");
    expect(serializedBlocks).toContain(
      "https://mail.google.com/mail/u/?authuser=user%40example.com#all/message-1",
    );
    expect(prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        messagingMessageId: "slack-ts-1",
        messagingMessageSentAt: expect.any(Date),
        messagingMessageStatus: MessagingMessageStatus.SENT,
      },
    });
  });

  it("previews the synced mailbox draft for Slack draft notifications", async () => {
    const provider = {
      getDraft: vi.fn().mockResolvedValue({
        id: "draft-1",
        threadId: "thread-1",
        textPlain:
          "Mailbox draft body\n\nDrafted by Inbox Zero.\n\nOn Thu, 30 Apr 2026 at 19:04, Sender <sender@example.com> wrote:\n\n> Quoted body that should be hidden.",
        subject: "Re: Test subject",
        date: new Date().toISOString(),
        snippet: "Mailbox draft body",
        historyId: "1",
        internalDate: "1",
        headers: {
          from: "user@example.com",
          to: "sender@example.com",
          subject: "Re: Test subject",
          date: "Mon, 1 Jan 2024 12:00:00 +0000",
        },
        labelIds: [],
        inline: [],
      } satisfies ParsedMessage),
    };

    mockCreateEmailProvider.mockResolvedValue(provider);
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Messaging draft body",
      mailboxDraftAction: {
        id: "draft-action-1",
        draftId: "draft-1",
        subject: "Re: Test subject",
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(provider.getDraft).toHaveBeenCalledWith("draft-1");
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("Mailbox draft body");
    expect(serializedBlocks).toContain("Drafted by Inbox Zero.");
    expect(serializedBlocks).not.toContain("Messaging draft body");
    expect(serializedBlocks).not.toContain("Quoted body that should be hidden");
    expect(serializedBlocks).not.toContain("On Thu, 30 Apr 2026");
  });

  it("mentions AI-selected attachments in Slack draft notifications", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      selectedAttachments: [
        {
          driveConnectionId: "drive-1",
          fileId: "file-1",
          filename: "certificate.pdf",
          mimeType: "application/pdf",
          reason: "requested certificate",
        },
      ],
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("Attachments:");
    expect(serializedBlocks).toContain("certificate.pdf");
  });

  it("mentions configured attachments in Slack draft notifications", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      staticAttachments: [
        {
          driveConnectionId: "drive-1",
          name: "quote.pdf",
          sourceId: "file-1",
          sourcePath: null,
          type: AttachmentSourceType.FILE,
        },
      ],
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("Attachments:");
    expect(serializedBlocks).toContain("quote.pdf");
  });

  it("falls back to stored draft content when synced mailbox draft lookup fails", async () => {
    mockCreateEmailProvider.mockRejectedValue(new Error("provider failed"));
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Messaging draft body",
      mailboxDraftAction: {
        id: "draft-action-1",
        draftId: "draft-1",
        subject: "Re: Test subject",
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("Messaging draft body");
  });

  it("adds an Open in Outlook button for Slack draft notifications on Microsoft accounts", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      accountProvider: "microsoft",
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("Open in Outlook");
    expect(serializedBlocks).toContain(
      "https://outlook.office.com/mail/inbox/id/message-1",
    );
  });

  it("does not add a mailbox link for unsupported account providers", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      accountProvider: "imap",
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).not.toContain("Open in Gmail");
    expect(serializedBlocks).not.toContain("Open in Outlook");
  });

  it("shows consistent standalone Slack notification actions", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const actionsBlock = args.blocks.find(
      (block: { type: string }) => block.type === "actions",
    );
    const elements = actionsBlock.elements;
    const buttonLabels = elements
      .filter((element: { type: string }) => element.type === "button")
      .map((element: { text: { text: string } }) => element.text.text);

    expect(buttonLabels).toEqual([
      "Archive",
      "Mark read",
      "Open in Gmail",
      "Dismiss",
    ]);
    expect(elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "static_select",
          action_id: "rule_notify_more",
          placeholder: { type: "plain_text", text: "More" },
          options: [
            expect.objectContaining({
              text: { type: "plain_text", text: "Delete" },
              value: "rule_notify_trash:action-1",
            }),
            expect.objectContaining({
              text: { type: "plain_text", text: "Spam" },
              value: "rule_notify_mark_spam:action-1",
            }),
          ],
        }),
        expect.objectContaining({
          type: "button",
          action_id: expect.stringContaining("mail.google.com"),
          url: "https://mail.google.com/mail/u/?authuser=user%40example.com#all/message-1",
        }),
        expect.objectContaining({
          type: "button",
          action_id: "rule_draft_dismiss",
          value: "action-1",
        }),
      ]),
    );
    expect(elements).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "button",
          action_id: "rule_notify_trash",
        }),
        expect.objectContaining({
          type: "button",
          action_id: "rule_notify_mark_spam",
        }),
      ]),
    );
  });

  it("uses the full plain text body for Slack notification previews", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const longBody = "Full body ".repeat(80).trim();

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Short snippet",
        textPlain: longBody,
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain(longBody);
    expect(serializedBlocks).not.toContain("Short snippet");
  });

  it("converts HTML-only emails for Slack notification previews", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Short snippet",
        textHtml:
          '<div><p>HTML only body</p><p>Second line</p><img src="image.png" /></div>',
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("HTML only body");
    expect(serializedBlocks).toContain("Second line");
    expect(serializedBlocks).not.toContain("Short snippet");
    expect(serializedBlocks).not.toContain("<p>");
    expect(serializedBlocks).not.toContain("image.png");
  });

  it("prefers converted HTML over plain text for Slack notification previews", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Short snippet",
        textPlain: "Plain fallback body",
        textHtml: "<p>Rendered HTML body</p>",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("Rendered HTML body");
    expect(serializedBlocks).not.toContain("Plain fallback body");
    expect(serializedBlocks).not.toContain("Short snippet");
  });

  it("strips quoted reply content from Slack draft notification previews", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Short snippet",
        textPlain:
          "Fresh request line.\n\nOn Tue, Apr 28, 2026 at 1:10 PM, Sender <sender@example.com> wrote:\n\n> Older quoted line that should not be shown.",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("Fresh request line.");
    expect(serializedBlocks).not.toContain("Older quoted line");
    expect(serializedBlocks).not.toContain("On Tue, Apr 28");
    expect(serializedBlocks).not.toContain("Short snippet");
  });

  it("delivers Teams notifications through the linked messaging fallback", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TEAMS,
        isConnected: true,
        teamId: "tenant-1",
        providerUserId: "29:teams-user",
        accessToken: null,
        channelId: null,
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSendAutomationMessage).toHaveBeenCalledWith({
      channel: expect.objectContaining({
        provider: MessagingProvider.TEAMS,
        providerUserId: "29:teams-user",
      }),
      route: {
        purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
        targetId: "29:teams-user",
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      },
      text: expect.stringContaining(
        "Quick actions like archive and mark read are Slack-only right now",
      ),
      logger: expect.anything(),
    });
    expect(prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        messagingMessageId: "teams-message-1",
        messagingMessageSentAt: expect.any(Date),
        messagingMessageStatus: MessagingMessageStatus.SENT,
      },
    });
  });

  it("sends plain draft previews through the linked messaging fallback", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TEAMS,
        isConnected: true,
        teamId: "tenant-1",
        providerUserId: "29:teams-user",
        accessToken: null,
        channelId: null,
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "First line\nSecond line",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSendAutomationMessage).toHaveBeenCalledWith({
      channel: expect.objectContaining({
        provider: MessagingProvider.TEAMS,
        providerUserId: "29:teams-user",
      }),
      route: {
        purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
        targetId: "29:teams-user",
        targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      },
      text: expect.stringContaining("💬 They wrote:\nFirst line\nSecond line"),
      logger: expect.anything(),
    });

    const [{ text }] = mockSendAutomationMessage.mock.calls[0];
    expect(text).not.toContain("\n> First line");
    expect(text).toContain(
      "One-click draft editing and sending aren't available in Teams yet.",
    );
  });

  it("strips quoted reply content from Teams draft notification previews", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TEAMS,
        isConnected: true,
        teamId: "tenant-1",
        providerUserId: "29:teams-user",
        accessToken: null,
        channelId: null,
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Short snippet",
        textPlain:
          "Fresh request line.\n\nOn Tue, Apr 28, 2026 at 1:10 PM, Sender <sender@example.com> wrote:\n\n> Older quoted line that should not be shown.",
      },
      logger,
    });

    expect(delivered).toBe(true);

    const [{ text }] = mockSendAutomationMessage.mock.calls[0];
    expect(text).toContain("Fresh request line.");
    expect(text).not.toContain("Older quoted line");
    expect(text).not.toContain("On Tue, Apr 28");
    expect(text).not.toContain("Short snippet");
  });

  it("sends Telegram draft notifications with a Send reply action", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TELEGRAM,
        isConnected: true,
        teamId: "telegram-chat-1",
        providerUserId: "telegram-user-1",
        accessToken: null,
        channelId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
            targetId: "telegram-chat-1",
            targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          },
        ],
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockSendAutomationMessage).not.toHaveBeenCalled();
    expect(mockTelegramOpenDm).toHaveBeenCalledWith("telegram-chat-1");
    expect(mockTelegramPostMessage).toHaveBeenCalledTimes(1);

    const [, card] = mockTelegramPostMessage.mock.calls[0];
    const serializedCard = JSON.stringify(card);

    expect(serializedCard).toContain("Send reply");
    expect(serializedCard).toContain("Open in Gmail");
    expect(serializedCard).not.toContain("Edit draft");
    expect(prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        messagingMessageId: "telegram-message-1",
        messagingMessageSentAt: expect.any(Date),
        messagingMessageStatus: MessagingMessageStatus.SENT,
      },
    });
  });

  it("mentions AI-selected attachments in Telegram draft notifications", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      selectedAttachments: [
        {
          driveConnectionId: "drive-1",
          fileId: "file-1",
          filename: "certificate.pdf",
          mimeType: "application/pdf",
          reason: "requested certificate",
        },
      ],
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TELEGRAM,
        isConnected: true,
        teamId: "telegram-chat-1",
        providerUserId: "telegram-user-1",
        accessToken: null,
        channelId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
            targetId: "telegram-chat-1",
            targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          },
        ],
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockTelegramPostMessage).toHaveBeenCalledTimes(1);

    const [, card] = mockTelegramPostMessage.mock.calls[0];
    const serializedCard = JSON.stringify(card);

    expect(serializedCard).toContain("Attachments:");
    expect(serializedCard).toContain("certificate.pdf");
  });

  it("renders decoded email previews in Telegram draft notification cards", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TELEGRAM,
        isConnected: true,
        teamId: "telegram-chat-1",
        providerUserId: "telegram-user-1",
        accessToken: null,
        channelId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
            targetId: "telegram-chat-1",
            targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          },
        ],
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet:
          "Quoted reply said A &gt; B, C &lt; D, and Tom &amp; Jerry replied.",
      },
      logger,
    });

    expect(delivered).toBe(true);

    const [, card] = mockTelegramPostMessage.mock.calls[0];
    const serializedCard = JSON.stringify(card);

    expect(serializedCard).toContain(
      "Quoted reply said A > B, C < D, and Tom & Jerry replied.",
    );
    expect(serializedCard).not.toContain("&gt;");
    expect(serializedCard).not.toContain("&lt;");
    expect(serializedCard).not.toContain("&amp;");
  });

  it("strips quoted reply content from Telegram draft notification cards", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TELEGRAM,
        isConnected: true,
        teamId: "telegram-chat-1",
        providerUserId: "telegram-user-1",
        accessToken: null,
        channelId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
            targetId: "telegram-chat-1",
            targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          },
        ],
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Short snippet",
        textPlain:
          "Fresh request line.\n\nOn Tue, Apr 28, 2026 at 1:10 PM, Sender <sender@example.com> wrote:\n\n> Older quoted line that should not be shown.",
      },
      logger,
    });

    expect(delivered).toBe(true);

    const [, card] = mockTelegramPostMessage.mock.calls[0];
    const serializedCard = JSON.stringify(card);

    expect(serializedCard).toContain("Fresh request line.");
    expect(serializedCard).not.toContain("Older quoted line");
    expect(serializedCard).not.toContain("On Tue, Apr 28");
    expect(serializedCard).not.toContain("Short snippet");
  });

  it("sends Telegram draft notification cards without raw markdown-sensitive text", async () => {
    mockNotificationContext({
      id: "cmabcdef1234567890123456",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: String.raw`Use the C:\labels\account_name tag and keep *exact* wording.`,
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TELEGRAM,
        isConnected: true,
        teamId: "telegram-chat-1",
        providerUserId: "telegram-user-1",
        accessToken: null,
        channelId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
            targetId: "telegram-chat-1",
            targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          },
        ],
      },
    });
    prisma.executedAction.update.mockResolvedValue({} as never);

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "cmabcdef1234567890123456",
      email: {
        headers: {
          from: "Sender_Name <sender@example.com>",
          subject: "Question about [billing]_status",
        },
        snippet: "Can you review item_name before 5 * 6?",
      },
      logger,
    });

    expect(delivered).toBe(true);
    expect(mockTelegramPostMessage).toHaveBeenCalledTimes(1);

    const [, card] = mockTelegramPostMessage.mock.calls[0];
    const cardText = (
      card as { children?: Array<{ content?: string }> }
    ).children
      ?.map((child) => child.content ?? "")
      .join("\n");

    expect(card).not.toMatchObject({ title: expect.any(String) });
    expect(JSON.stringify(card)).not.toContain("**");
    expect(cardText).not.toContain("*They wrote:*");
    expect(cardText).not.toContain("Sender_Name");
    expect(cardText).toContain("Sender\\_Name");
    expect(cardText).toContain("\\[billing]");
    expect(cardText).toContain("5 \\* 6");
    expect(cardText).toContain(String.raw`C:\\labels\\account\_name`);
  });

  it("skips linked notifications when provider routing data is incomplete", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TEAMS,
        isConnected: true,
        teamId: "tenant-1",
        providerUserId: null,
        accessToken: null,
        channelId: null,
      },
    });

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(false);
    expect(mockSendAutomationMessage).not.toHaveBeenCalled();
    expect(prisma.executedAction.update).not.toHaveBeenCalled();
  });

  it("skips notifications when the messaging channel belongs to another account", async () => {
    mockNotificationContext({
      id: "action-1",
      type: ActionType.NOTIFY_MESSAGING_CHANNEL,
      content: null,
      messagingChannel: {
        id: "channel-1",
        emailAccountId: "other-email-account-id",
        provider: MessagingProvider.SLACK,
        isConnected: true,
        teamId: "team-1",
        providerUserId: null,
        accessToken: "token",
        channelId: "C123",
      },
    });

    const { sendMessagingRuleNotification } = await import(
      "./rule-notifications"
    );

    const delivered = await sendMessagingRuleNotification({
      executedActionId: "action-1",
      email: {
        headers: {
          from: "sender@example.com",
          subject: "Test subject",
        },
        snippet: "Preview text",
      },
      logger,
    });

    expect(delivered).toBe(false);
    expect(prisma.executedAction.update).not.toHaveBeenCalled();
  });
});

describe("buildMessagingRuleNotificationText", () => {
  it("adds a Telegram-specific draft caveat for Telegram fallbacks", async () => {
    const { buildMessagingRuleNotificationText } = await import(
      "./rule-notifications"
    );

    const text = buildMessagingRuleNotificationText({
      actionType: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: {
        title: "✍️ I drafted a reply for you",
        summary: "You got an email from *Sender*.\n*Subject:* Test",
        details: [
          "✍️ *I drafted a reply for you:*\nSee <https://example.com|details>.",
        ],
      },
      provider: MessagingProvider.TELEGRAM,
    });

    expect(text).toContain("I drafted a reply for you");
    expect(text).toContain("You got an email from Sender.");
    expect(text).toContain("Subject: Test");
    expect(text).toContain("details: https://example.com");
    expect(text).toContain("Draft editing isn't available in Telegram yet.");
  });

  it("unescapes Slack entities for Teams fallback", async () => {
    const { buildMessagingRuleNotificationText } = await import(
      "./rule-notifications"
    );

    const text = buildMessagingRuleNotificationText({
      actionType: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: {
        title: "✍️ I drafted a reply for you",
        summary:
          "You got an email from *Tom &amp; Jerry*.\n*Subject:* A &lt;B&gt;",
        details: ["💬 *They wrote:*\nHello &amp; welcome"],
      },
      provider: MessagingProvider.TEAMS,
    });

    expect(text).toContain("Tom & Jerry");
    expect(text).toContain("A <B>");
    expect(text).toContain("Hello & welcome");
    expect(text).not.toContain("&amp;");
    expect(text).not.toContain("&lt;");
    expect(text).not.toContain("&gt;");
  });
});

describe("replaceMessagingDraftNotificationsWithHandledOnWebState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSlackUpdate.mockResolvedValue({});
    mockTeamsOpenDm.mockResolvedValue("teams-thread-1");
    mockTeamsEditMessage.mockResolvedValue({ id: "teams-message-1" });
    mockTelegramOpenDm.mockResolvedValue("telegram-thread-1");
    mockTelegramEditMessage.mockResolvedValue({ id: "telegram-message-1" });
  });

  it("collapses an active Slack draft notification after a web reply", async () => {
    prisma.executedAction.findMany.mockResolvedValue([
      { id: "action-1" },
    ] as never);
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingMessageId: "slack-ts-1",
      messagingMessageStatus: MessagingMessageStatus.SENT,
    });
    prisma.executedAction.updateMany.mockResolvedValue({ count: 1 } as never);

    const { replaceMessagingDraftNotificationsWithHandledOnWebState } =
      await import("./rule-notifications");

    await replaceMessagingDraftNotificationsWithHandledOnWebState({
      executedRuleId: "executed-rule-1",
      logger,
    });

    expect(prisma.executedAction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "action-1",
        OR: [
          { messagingMessageStatus: null },
          {
            messagingMessageStatus: {
              in: [
                MessagingMessageStatus.SENT,
                MessagingMessageStatus.DRAFT_EDITED,
              ],
            },
          },
        ],
      },
      data: {
        messagingMessageStatus: MessagingMessageStatus.EXPIRED,
      },
    });
    expect(mockSlackUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        ts: "slack-ts-1",
        text: expect.stringContaining("Already replied on the web."),
      }),
    );

    const [args] = mockSlackUpdate.mock.calls[0];
    expect(JSON.stringify(args.blocks)).toContain(
      "Already replied on the web.",
    );
    expect(JSON.stringify(args.blocks)).not.toContain("Send reply");
  });

  it("collapses a Teams draft notification after a web reply", async () => {
    prisma.executedAction.findMany.mockResolvedValue([
      { id: "action-1" },
    ] as never);
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingMessageId: "teams-message-1",
      messagingMessageStatus: MessagingMessageStatus.SENT,
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TEAMS,
        isConnected: true,
        teamId: "teams-tenant-1",
        providerUserId: "29:teams-user",
        accessToken: null,
        channelId: null,
      },
    });
    prisma.executedAction.updateMany.mockResolvedValue({ count: 1 } as never);

    const { replaceMessagingDraftNotificationsWithHandledOnWebState } =
      await import("./rule-notifications");

    await replaceMessagingDraftNotificationsWithHandledOnWebState({
      executedRuleId: "executed-rule-1",
      logger,
    });

    expect(mockTeamsOpenDm).toHaveBeenCalledWith("29:teams-user");
    expect(mockTeamsEditMessage).toHaveBeenCalledWith(
      "teams-thread-1",
      "teams-message-1",
      "Already replied on the web.",
    );
  });

  it("collapses a Telegram draft notification after a web reply", async () => {
    prisma.executedAction.findMany.mockResolvedValue([
      { id: "action-1" },
    ] as never);
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingMessageId: "telegram-message-1",
      messagingMessageStatus: MessagingMessageStatus.SENT,
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TELEGRAM,
        isConnected: true,
        teamId: "telegram-chat-1",
        providerUserId: "telegram-user-1",
        accessToken: null,
        channelId: null,
        routes: [
          {
            purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
            targetId: "telegram-chat-1",
            targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
          },
        ],
      },
    });
    prisma.executedAction.updateMany.mockResolvedValue({ count: 1 } as never);

    const { replaceMessagingDraftNotificationsWithHandledOnWebState } =
      await import("./rule-notifications");

    await replaceMessagingDraftNotificationsWithHandledOnWebState({
      executedRuleId: "executed-rule-1",
      logger,
    });

    expect(mockTelegramOpenDm).toHaveBeenCalledWith("telegram-chat-1");
    expect(mockTelegramEditMessage).toHaveBeenCalledWith(
      "telegram-thread-1",
      "telegram-message-1",
      "Already replied on the web.",
    );
  });

  it("keeps chat-sent draft notifications unchanged", async () => {
    prisma.executedAction.findMany.mockResolvedValue([
      { id: "action-1" },
    ] as never);
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingMessageId: "slack-ts-1",
      messagingMessageStatus: MessagingMessageStatus.DRAFT_SENT,
    });

    const { replaceMessagingDraftNotificationsWithHandledOnWebState } =
      await import("./rule-notifications");

    prisma.executedAction.updateMany.mockResolvedValue({ count: 0 } as never);

    await replaceMessagingDraftNotificationsWithHandledOnWebState({
      executedRuleId: "executed-rule-1",
      logger,
    });

    expect(prisma.executedAction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "action-1",
        OR: [
          { messagingMessageStatus: null },
          {
            messagingMessageStatus: {
              in: [
                MessagingMessageStatus.SENT,
                MessagingMessageStatus.DRAFT_EDITED,
              ],
            },
          },
        ],
      },
      data: {
        messagingMessageStatus: MessagingMessageStatus.EXPIRED,
      },
    });
    expect(mockSlackUpdate).not.toHaveBeenCalled();
    expect(mockTeamsEditMessage).not.toHaveBeenCalled();
    expect(mockTelegramEditMessage).not.toHaveBeenCalled();
  });

  it("expires locally when a Slack notification cannot be edited remotely", async () => {
    prisma.executedAction.findMany.mockResolvedValue([
      { id: "action-1" },
    ] as never);
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingMessageId: "slack-ts-1",
      messagingMessageStatus: MessagingMessageStatus.SENT,
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.SLACK,
        isConnected: true,
        teamId: "team-1",
        providerUserId: null,
        accessToken: null,
        channelId: "C123",
      },
    });
    prisma.executedAction.updateMany.mockResolvedValue({ count: 1 } as never);

    const { replaceMessagingDraftNotificationsWithHandledOnWebState } =
      await import("./rule-notifications");

    await replaceMessagingDraftNotificationsWithHandledOnWebState({
      executedRuleId: "executed-rule-1",
      logger,
    });

    expect(prisma.executedAction.updateMany).toHaveBeenCalledWith({
      where: {
        id: "action-1",
        OR: [
          { messagingMessageStatus: null },
          {
            messagingMessageStatus: {
              in: [
                MessagingMessageStatus.SENT,
                MessagingMessageStatus.DRAFT_EDITED,
              ],
            },
          },
        ],
      },
      data: {
        messagingMessageStatus: MessagingMessageStatus.EXPIRED,
      },
    });
    expect(mockSlackUpdate).not.toHaveBeenCalled();
  });

  it("expires legacy draft notifications with a null status", async () => {
    prisma.executedAction.findMany.mockResolvedValue([
      { id: "action-1" },
    ] as never);
    mockNotificationContext({
      id: "action-1",
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: "Draft body",
      messagingMessageId: "teams-message-1",
      messagingMessageStatus: null,
      messagingChannel: {
        id: "channel-1",
        provider: MessagingProvider.TEAMS,
        isConnected: true,
        teamId: "teams-tenant-1",
        providerUserId: "29:teams-user",
        accessToken: null,
        channelId: null,
      },
    });
    prisma.executedAction.updateMany.mockResolvedValue({ count: 1 } as never);

    const { replaceMessagingDraftNotificationsWithHandledOnWebState } =
      await import("./rule-notifications");

    await replaceMessagingDraftNotificationsWithHandledOnWebState({
      executedRuleId: "executed-rule-1",
      logger,
    });

    expect(mockTeamsOpenDm).toHaveBeenCalledWith("29:teams-user");
    expect(mockTeamsEditMessage).toHaveBeenCalledWith(
      "teams-thread-1",
      "teams-message-1",
      "Already replied on the web.",
    );
  });

  it("continues collapsing other draft notifications when one lookup fails", async () => {
    prisma.executedAction.findMany.mockResolvedValue([
      { id: "action-1" },
      { id: "action-2" },
    ] as never);
    prisma.executedAction.findUnique.mockImplementation(async ({ where }) => {
      if (where?.id === "action-1") {
        throw new Error("lookup failed");
      }

      if (where?.id === "action-2") {
        return getNotificationContext({
          id: "action-2",
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          content: "Draft body",
          messagingMessageId: "teams-message-1",
          messagingMessageStatus: MessagingMessageStatus.SENT,
          messagingChannel: {
            id: "channel-1",
            provider: MessagingProvider.TEAMS,
            isConnected: true,
            teamId: "teams-tenant-1",
            providerUserId: "29:teams-user",
            accessToken: null,
            channelId: null,
          },
        }) as never;
      }

      return null as never;
    });
    prisma.executedAction.updateMany.mockResolvedValue({ count: 1 } as never);

    const { replaceMessagingDraftNotificationsWithHandledOnWebState } =
      await import("./rule-notifications");

    await expect(
      replaceMessagingDraftNotificationsWithHandledOnWebState({
        executedRuleId: "executed-rule-1",
        logger,
      }),
    ).resolves.toBeUndefined();

    expect(mockTeamsOpenDm).toHaveBeenCalledWith("29:teams-user");
    expect(mockTeamsEditMessage).toHaveBeenCalledWith(
      "teams-thread-1",
      "teams-message-1",
      "Already replied on the web.",
    );
  });
});

function mockNotificationContext(
  options: Parameters<typeof getNotificationContext>[0],
) {
  prisma.executedAction.findUnique.mockResolvedValue(
    getNotificationContext(options) as never,
  );
}

function createSlackActionEvent({
  actionId,
  value,
  editMessage = vi.fn().mockResolvedValue(undefined),
  postEphemeral = vi.fn(),
}: {
  actionId: string;
  value: string;
  editMessage?: ReturnType<typeof vi.fn>;
  postEphemeral?: ReturnType<typeof vi.fn>;
}) {
  return {
    actionId,
    value,
    user: { userId: "user-1" },
    raw: { team: { id: "team-1" } },
    threadId: "slack-thread-1",
    messageId: "slack-message-1",
    adapter: { name: "slack", editMessage },
    thread: { postEphemeral },
  } as any;
}

function createTelegramActionEvent({
  editMessage = vi.fn().mockResolvedValue(undefined),
}: {
  editMessage?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    actionId: "rule_draft_send",
    value: "action-1",
    user: { userId: "telegram-user-1" },
    raw: {
      callback_query: {
        message: {
          chat: { id: "telegram-chat-1" },
        },
      },
    },
    threadId: "telegram:telegram-chat-1",
    messageId: "telegram-message-1",
    adapter: {
      name: "telegram",
      decodeThreadId: vi.fn().mockReturnValue({ chatId: "telegram-chat-1" }),
      editMessage,
    },
    thread: { post: vi.fn() },
  } as any;
}

function getNotificationContext({
  id,
  type,
  content,
  messagingChannel,
  accountProvider = "google",
  messagingMessageId = null,
  messagingMessageStatus = null,
  mailboxDraftAction = null,
  staticAttachments = null,
  selectedAttachments = null,
}: {
  id: string;
  type: ActionType;
  content: string | null;
  messagingChannel?: {
    id: string;
    emailAccountId?: string;
    provider: MessagingProvider;
    isConnected: boolean;
    teamId: string | null;
    providerUserId: string | null;
    accessToken: string | null;
    channelId: string | null;
    routes?: Array<{
      purpose: MessagingRoutePurpose;
      targetId: string;
      targetType: MessagingRouteTargetType;
    }>;
  };
  accountProvider?: "google" | "microsoft" | "imap";
  messagingMessageId?: string | null;
  messagingMessageStatus?: MessagingMessageStatus | null;
  mailboxDraftAction?: {
    id: string;
    draftId: string;
    subject: string | null;
  } | null;
  staticAttachments?: unknown;
  selectedAttachments?: unknown;
}) {
  const defaultRoutes =
    messagingChannel?.routes ??
    (messagingChannel?.provider === MessagingProvider.SLACK &&
    messagingChannel.channelId
      ? [
          {
            purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
            targetType: MessagingRouteTargetType.CHANNEL,
            targetId: messagingChannel.channelId,
          },
        ]
      : messagingChannel?.provider === MessagingProvider.TEAMS &&
          messagingChannel.providerUserId
        ? [
            {
              purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
              targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
              targetId: messagingChannel.providerUserId,
            },
          ]
        : []);

  return {
    id,
    type,
    content,
    subject: null,
    to: null,
    cc: null,
    bcc: null,
    draftId: null,
    staticAttachments,
    selectedAttachments,
    messagingChannelId: "channel-1",
    messagingMessageId,
    messagingMessageStatus,
    executedRule: {
      id: "executed-rule-1",
      ruleId: "rule-1",
      messageId: "message-1",
      threadId: "thread-1",
      emailAccount: {
        id: "email-account-1",
        userId: "user-1",
        email: "user@example.com",
        account: {
          provider: accountProvider,
        },
      },
      rule: {
        systemType: null,
      },
      actionItems: mailboxDraftAction ? [mailboxDraftAction] : [],
    },
    messagingChannel: messagingChannel
      ? {
          emailAccountId: "email-account-1",
          ...messagingChannel,
          routes: defaultRoutes,
        }
      : {
          id: "channel-1",
          emailAccountId: "email-account-1",
          provider: MessagingProvider.SLACK,
          isConnected: true,
          teamId: "team-1",
          providerUserId: "user-1",
          accessToken: "token",
          channelId: "C123",
          routes: [
            {
              purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
              targetType: MessagingRouteTargetType.CHANNEL,
              targetId: "C123",
            },
          ],
        },
  };
}
