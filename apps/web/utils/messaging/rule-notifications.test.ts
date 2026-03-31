import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { ActionType, MessagingProvider } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

const mockCreateEmailProvider = vi.fn();

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => mockCreateEmailProvider(...args),
}));

describe("handleSlackRuleNotificationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(cardText).toContain('re \\"Test subject\\"');
    expect(cardText).toContain("*Original email*");
    expect(cardText).toContain("Original message body");
    expect(cardText).toContain("*Draft reply*");
    expect(cardText).toContain('Try opening the \\"Test\\" tab.');
    expect(cardText).toContain(
      "Drafted by <https://getinboxzero.com/?ref=ABC|Inbox Zero>.",
    );
    expect(cardText).toContain("Status: Reply sent.");
  });
});

function getNotificationContext({
  id,
  type,
  content,
}: {
  id: string;
  type: ActionType;
  content: string | null;
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
    messagingChannel: {
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
