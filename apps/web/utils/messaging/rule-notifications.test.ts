import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  ActionType,
  MessagingMessageStatus,
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

const mockCreateEmailProvider = vi.fn();
const mockSendAutomationMessage = vi.fn();
const mockSlackPostMessage = vi.fn();
const mockSlackJoin = vi.fn();
const mockTelegramOpenDm = vi.fn();
const mockTelegramPostMessage = vi.fn();

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
      telegram: {
        openDM: (...args: unknown[]) => mockTelegramOpenDm(...args),
        postMessage: (...args: unknown[]) => mockTelegramPostMessage(...args),
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
    mockSlackJoin.mockResolvedValue({});
    mockTelegramOpenDm.mockResolvedValue("telegram-thread-1");
    mockTelegramPostMessage.mockResolvedValue({ id: "telegram-message-1" });
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

    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
        id: "action-1",
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        content:
          'Thanks for the note.\n\nTry opening the &quot;Test&quot; tab.\n\nDrafted by <a href="https://getinboxzero.com/?ref=ABC">Inbox Zero</a>.',
      }) as never,
    );
    prisma.executedAction.findFirst.mockResolvedValue({
      id: "draft-action-1",
      draftId: "draft-1",
      subject: "Re: Test subject",
    } as never);
    prisma.executedAction.update.mockResolvedValue({} as never);

    const editMessage = vi.fn().mockResolvedValue(undefined);
    const event = {
      actionId: "rule_draft_send",
      value: "action-1",
      user: { userId: "user-1" },
      raw: { team: { id: "team-1" } },
      threadId: "slack-thread-1",
      messageId: "slack-message-1",
      adapter: { editMessage },
      thread: { postEphemeral: vi.fn() },
    } as any;

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger: createScopedLogger("test"),
    });

    expect(provider.sendDraft).toHaveBeenCalledWith("draft-1");
    expect(editMessage).toHaveBeenCalledTimes(1);

    const [, , card] = editMessage.mock.calls[0];
    const cardText = JSON.stringify(card);

    expect(cardText).toContain("New email — reply drafted");
    expect(cardText).toContain("*sender@example.com*");
    expect(cardText).toContain('about \\"Test subject\\"');
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
      "https://mail.google.com/mail/u/0/?authuser=user%40example.com/#all/message-1",
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

    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
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
      }) as never,
    );
    prisma.executedAction.findFirst.mockResolvedValue({
      id: "draft-action-1",
      draftId: "draft-1",
      subject: "Re: Test subject",
    } as never);
    prisma.executedAction.update.mockResolvedValue({} as never);

    const editMessage = vi.fn().mockResolvedValue(undefined);
    const event = {
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

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger: createScopedLogger("test"),
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

    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
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
      }) as never,
    );
    prisma.executedAction.findFirst.mockResolvedValue({
      id: "draft-action-1",
      draftId: "draft-1",
      subject: "Re: Test subject",
    } as never);
    prisma.executedAction.update.mockResolvedValue({} as never);

    const editMessage = vi.fn().mockResolvedValue(undefined);
    const event = {
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

    const { handleRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleRuleNotificationAction({
      event,
      logger: createScopedLogger("test"),
    });

    expect(provider.sendDraft).toHaveBeenCalledWith("draft-1");
    expect(editMessage).toHaveBeenCalledTimes(1);
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
    mockTelegramOpenDm.mockResolvedValue("telegram-thread-1");
    mockTelegramPostMessage.mockResolvedValue({ id: "telegram-message-1" });
  });

  it("adds an Open in Gmail button for Slack draft notifications on Google accounts", async () => {
    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
        id: "action-1",
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        content: "Draft body",
      }) as never,
    );
    prisma.executedAction.findFirst.mockResolvedValue(null as never);
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
      logger: createScopedLogger("test"),
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("Open in Gmail");
    expect(serializedBlocks).toContain(
      "https://mail.google.com/mail/u/0/?authuser=user%40example.com/#all/message-1",
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

  it("adds an Open in Outlook button for Slack draft notifications on Microsoft accounts", async () => {
    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
        id: "action-1",
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        content: "Draft body",
        accountProvider: "microsoft",
      }) as never,
    );
    prisma.executedAction.findFirst.mockResolvedValue(null as never);
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
      logger: createScopedLogger("test"),
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).toContain("Open in Outlook");
    expect(serializedBlocks).toContain(
      "https://outlook.live.com/mail/0/inbox/id/message-1",
    );
  });

  it("does not add a mailbox link for unsupported account providers", async () => {
    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
        id: "action-1",
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        content: "Draft body",
        accountProvider: "imap",
      }) as never,
    );
    prisma.executedAction.findFirst.mockResolvedValue(null as never);
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
      logger: createScopedLogger("test"),
    });

    expect(delivered).toBe(true);
    expect(mockSlackPostMessage).toHaveBeenCalledTimes(1);

    const [args] = mockSlackPostMessage.mock.calls[0];
    const serializedBlocks = JSON.stringify(args.blocks);

    expect(serializedBlocks).not.toContain("Open in Gmail");
    expect(serializedBlocks).not.toContain("Open in Outlook");
  });

  it("delivers Teams notifications through the linked messaging fallback", async () => {
    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
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
      }) as never,
    );
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
      logger: createScopedLogger("test"),
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
    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
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
      }) as never,
    );
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
      logger: createScopedLogger("test"),
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
    expect(text).toContain("Slack-only");
  });

  it("sends Telegram draft notifications with a Send reply action", async () => {
    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
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
      }) as never,
    );
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
      logger: createScopedLogger("test"),
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

  it("skips linked notifications when provider routing data is incomplete", async () => {
    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
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
      }) as never,
    );

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
      logger: createScopedLogger("test"),
    });

    expect(delivered).toBe(false);
    expect(mockSendAutomationMessage).not.toHaveBeenCalled();
    expect(prisma.executedAction.update).not.toHaveBeenCalled();
  });

  it("skips notifications when the messaging channel belongs to another account", async () => {
    prisma.executedAction.findUnique.mockResolvedValue(
      getNotificationContext({
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
      }) as never,
    );

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
      logger: createScopedLogger("test"),
    });

    expect(delivered).toBe(false);
    expect(prisma.executedAction.update).not.toHaveBeenCalled();
  });
});

describe("buildMessagingRuleNotificationText", () => {
  it("adds a Slack-only caveat for Telegram draft fallbacks", async () => {
    const { buildMessagingRuleNotificationText } = await import(
      "./rule-notifications"
    );

    const text = buildMessagingRuleNotificationText({
      actionType: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: {
        title: "New email — reply drafted",
        summary: '📩 You got an email from *Sender* about "Test".',
        details: [
          "✍️ *I drafted a reply for you:*\nSee <https://example.com|details>.",
        ],
      },
      provider: MessagingProvider.TELEGRAM,
    });

    expect(text).toContain("New email — reply drafted");
    expect(text).toContain('You got an email from Sender about "Test".');
    expect(text).toContain("details: https://example.com");
    expect(text).toContain("Slack-only");
  });

  it("unescapes Slack entities for Teams fallback", async () => {
    const { buildMessagingRuleNotificationText } = await import(
      "./rule-notifications"
    );

    const text = buildMessagingRuleNotificationText({
      actionType: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: {
        title: "New email — reply drafted",
        summary:
          '📩 You got an email from *Tom &amp; Jerry* about "A &lt;B&gt;".',
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

function getNotificationContext({
  id,
  type,
  content,
  messagingChannel,
  accountProvider = "google",
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
    staticAttachments: null,
    messagingChannelId: "channel-1",
    messagingMessageStatus: null,
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
          providerUserId: null,
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
