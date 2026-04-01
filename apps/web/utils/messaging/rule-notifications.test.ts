import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  ActionType,
  MessagingMessageStatus,
  MessagingProvider,
} from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

const mockCreateEmailProvider = vi.fn();
const mockSendAutomationMessage = vi.fn();

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => mockCreateEmailProvider(...args),
}));

vi.mock("@/utils/automation-jobs/messaging", () => ({
  sendAutomationMessage: (...args: unknown[]) =>
    mockSendAutomationMessage(...args),
}));

describe("handleSlackRuleNotificationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAutomationMessage.mockResolvedValue({
      channelId: "teams-thread-1",
      messageId: "teams-message-1",
    });
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

    const { handleSlackRuleNotificationAction } = await import(
      "./rule-notifications"
    );

    await handleSlackRuleNotificationAction({
      event,
      logger: createScopedLogger("test"),
    });

    expect(provider.sendDraft).toHaveBeenCalledWith("draft-1");
    expect(editMessage).toHaveBeenCalledTimes(1);

    const [, , card] = editMessage.mock.calls[0];
    const cardText = JSON.stringify(card);

    expect(cardText).toContain("Draft reply");
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
  });
});

describe("sendMessagingRuleNotification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendAutomationMessage.mockResolvedValue({
      channelId: "teams-thread-1",
      messageId: "teams-message-1",
    });
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
});

describe("buildMessagingRuleNotificationText", () => {
  it("adds a Slack-only caveat for Telegram draft fallbacks", async () => {
    const { buildMessagingRuleNotificationText } = await import(
      "./rule-notifications"
    );

    const text = buildMessagingRuleNotificationText({
      actionType: ActionType.DRAFT_MESSAGING_CHANNEL,
      content: {
        title: "Draft reply",
        summary:
          'You got an email from *Sender* about "Test".\n\nI drafted a reply for you:\n>See <https://example.com|details>.',
      },
      provider: MessagingProvider.TELEGRAM,
    });

    expect(text).toContain("Draft reply");
    expect(text).toContain('You got an email from Sender about "Test".');
    expect(text).toContain("details: https://example.com");
    expect(text).toContain("Slack-only");
  });
});

function getNotificationContext({
  id,
  type,
  content,
  messagingChannel,
}: {
  id: string;
  type: ActionType;
  content: string | null;
  messagingChannel?: {
    id: string;
    provider: MessagingProvider;
    isConnected: boolean;
    teamId: string | null;
    providerUserId: string | null;
    accessToken: string | null;
    channelId: string | null;
  };
}) {
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
          provider: "google",
        },
      },
      rule: {
        systemType: null,
      },
    },
    messagingChannel: messagingChannel ?? {
      id: "channel-1",
      provider: MessagingProvider.SLACK,
      isConnected: true,
      teamId: "team-1",
      providerUserId: null,
      accessToken: "token",
      channelId: "C123",
    },
  };
}
