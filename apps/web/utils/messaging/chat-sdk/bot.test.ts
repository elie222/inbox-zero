import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  buildAffirmativeReactionMessage,
  buildHandledPendingEmailCard,
  buildPendingEmailConfirmationCard,
  buildPendingEmailCardFallbackText,
  buildMessagingUserMessages,
  getPendingEmailHandledOpenText,
  getPendingEmailHandledStatus,
  getPendingEmailHandledTitle,
  buildPendingEmailSummary,
  ensureSlackTeamInstallation,
  hasUnsupportedMessagingAttachment,
  normalizeMessagingAssistantText,
  normalizeMessagingUserText,
  stripLeadingSlackMention,
} from "@/utils/messaging/chat-sdk/bot";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("ensureSlackTeamInstallation", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (globalThis as any).inboxZeroMessagingChatSdk = {
      bot: {
        initialize: vi.fn().mockResolvedValue(undefined),
      },
      adapters: {
        slack: {
          getInstallation: vi.fn().mockResolvedValue(null),
          setInstallation: vi.fn().mockResolvedValue(undefined),
        },
      },
    };
  });

  it("loads the latest connected token when seeding installation", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue({
      accessToken: "xoxb-latest",
      botUserId: "B123",
      teamName: "Team",
    } as any);

    const logger = {
      warn: vi.fn(),
    } as any;

    await ensureSlackTeamInstallation("T-TEAM", logger);

    expect(prisma.messagingChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: {
          updatedAt: "desc",
        },
      }),
    );
  });
});

describe("stripLeadingSlackMention", () => {
  it("strips Slack app mention format", () => {
    expect(stripLeadingSlackMention("<@U123ABC> summarize my inbox")).toBe(
      "summarize my inbox",
    );
  });

  it("keeps compatibility with plain @mention text", () => {
    expect(stripLeadingSlackMention("@InboxZero summarize my inbox")).toBe(
      "summarize my inbox",
    );
  });
});

describe("normalizeMessagingAssistantText", () => {
  it("replaces leading 'Please click' instructions cleanly", () => {
    expect(
      normalizeMessagingAssistantText({
        text: "Please click the Send button in this Telegram thread.",
      }),
    ).toBe("This draft is pending confirmation.");
  });

  it("does not append redundant send-button guidance", () => {
    const input =
      "I prepared that reply for you. This draft is pending confirmation.";
    expect(normalizeMessagingAssistantText({ text: input })).toBe(input);
  });
});

describe("normalizeMessagingUserText", () => {
  it("converts emoji-only affirmative messages into plain yes", () => {
    expect(normalizeMessagingUserText({ text: "👍🏽" })).toBe("yes");
    expect(normalizeMessagingUserText({ text: ":thumbsup:" })).toBe("yes");
  });

  it("converts emoji-only negative messages into plain no", () => {
    expect(normalizeMessagingUserText({ text: "❌" })).toBe("no");
    expect(normalizeMessagingUserText({ text: "👎" })).toBe("no");
    expect(normalizeMessagingUserText({ text: ":thumbsdown:" })).toBe("no");
  });

  it("does not treat plain words as emoji aliases", () => {
    expect(normalizeMessagingUserText({ text: "check" })).toBe("check");
    expect(normalizeMessagingUserText({ text: "thumbsup" })).toBe("thumbsup");
  });

  it("can preserve emoji-only messages", () => {
    expect(
      normalizeMessagingUserText({
        text: "👍",
        convertEmojiOnlyResponses: false,
      }),
    ).toBe("👍");
    expect(
      normalizeMessagingUserText({
        text: ":thumbsup:",
        convertEmojiOnlyResponses: false,
      }),
    ).toBe(":thumbsup:");
  });

  it("leaves regular text unchanged", () => {
    expect(
      normalizeMessagingUserText({ text: "yes please summarize my inbox" }),
    ).toBe("yes please summarize my inbox");
  });
});

describe("buildAffirmativeReactionMessage", () => {
  it("converts a reaction event into a synthetic yes message", () => {
    const message = buildAffirmativeReactionMessage({
      event: {
        threadId: "teams:conversation-1",
        messageId: "message-1",
        emoji: { name: "thumbs_up" },
        raw: { type: "messageReaction" },
        user: {
          userId: "user-1",
          userName: "User One",
          fullName: "User One",
          isBot: false,
          isMe: false,
        },
      } as any,
    });

    expect(message.text).toBe("yes");
    expect(message.threadId).toBe("teams:conversation-1");
    expect(message.author.userId).toBe("user-1");
    expect(message.raw).toEqual({ type: "messageReaction" });
    expect(message.id).toContain("thumbs_up");
  });
});

describe("buildPendingEmailSummary", () => {
  it("includes reply target context when available", () => {
    expect(
      buildPendingEmailSummary({
        actionType: "reply_email",
        referenceFrom: "sender@example.com",
        referenceSubject: "Question",
      }),
    ).toBe('Reply to sender@example.com about "Question".');
  });

  it("formats forward summaries with source and destination", () => {
    expect(
      buildPendingEmailSummary({
        actionType: "forward_email",
        to: "recipient@example.com",
        referenceFrom: "sender@example.com",
        referenceSubject: "Project update",
      }),
    ).toBe(
      'Forward "Project update" from sender@example.com to recipient@example.com.',
    );
  });
});

describe("buildPendingEmailCardFallbackText", () => {
  it("adds actionable guidance when the confirmation card fails", () => {
    expect(
      buildPendingEmailCardFallbackText("This draft is pending confirmation."),
    ).toBe(
      "This draft is pending confirmation.\n\nI couldn't show the Send button right now. Ask me to prepare the draft again.",
    );
  });

  it("does not duplicate fallback guidance when already present", () => {
    const input =
      "This draft is pending confirmation.\n\nI couldn't show the Send button right now. Ask me to prepare the draft again.";
    expect(buildPendingEmailCardFallbackText(input)).toBe(input);
  });
});

describe("buildMessagingUserMessages", () => {
  it("keeps unsupported attachment context out of persisted user-visible parts", () => {
    const { userMessageId, newUserMessage, modelUserMessage } =
      buildMessagingUserMessages({
        hasUnsupportedAttachments: true,
        imageParts: [],
        messageId: "message-1",
        messageText: "Please draft a reply about this file.",
        provider: "telegram",
      });

    expect(userMessageId).toBe("telegram-message-1");
    expect(newUserMessage.parts).toEqual([
      { type: "text", text: "Please draft a reply about this file." },
    ]);
    expect(modelUserMessage.parts).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("unsupported non-image file attachments"),
      }),
      { type: "text", text: "Please draft a reply about this file." },
    ]);
  });

  it("does not inject hidden context when attachments are supported", () => {
    const imagePart = {
      type: "file" as const,
      url: "data:image/png;base64,abc",
      mediaType: "image/png",
      filename: "image.png",
    };
    const { newUserMessage, modelUserMessage } = buildMessagingUserMessages({
      hasUnsupportedAttachments: false,
      imageParts: [imagePart],
      messageId: "message-2",
      messageText: "Summarize this image.",
      provider: "slack",
    });

    expect(newUserMessage).toEqual(modelUserMessage);
    expect(modelUserMessage.parts).toEqual([
      imagePart,
      { type: "text", text: "Summarize this image." },
    ]);
  });
});

describe("buildPendingEmailConfirmationCard", () => {
  it("escapes Telegram Markdown control characters in pending email cards", () => {
    const card = buildPendingEmailConfirmationCard({
      chatMessageId: "chat-message-1",
      part: {
        type: "tool-sendEmail",
        state: "output-available",
        toolCallId: "tool-call-1",
        output: {
          confirmationState: "pending",
          pendingAction: {
            to: "first_last@outlook.com",
            subject: "Plan [draft]",
            messageHtml: "<p>Use foo_bar *soon* [ok]</p>",
          },
        },
      },
      provider: "telegram",
    });

    const textChildren = card.children
      .filter((child) => child.type === "text")
      .map((child) => child.content);

    expect(textChildren[0]).toContain("first\\_last@outlook.com");
    expect(textChildren[0]).toContain("Plan \\[draft]");
    expect(textChildren[1]).toContain("foo\\_bar \\*soon\\* \\[ok]");
  });

  it("leaves non-Telegram pending email card text unchanged", () => {
    const card = buildPendingEmailConfirmationCard({
      chatMessageId: "chat-message-1",
      part: {
        type: "tool-sendEmail",
        state: "output-available",
        toolCallId: "tool-call-1",
        output: {
          confirmationState: "pending",
          pendingAction: {
            to: "first_last@outlook.com",
            subject: "Plan [draft]",
            messageHtml: "<p>Use foo_bar *soon* [ok]</p>",
          },
        },
      },
      provider: "slack",
    });

    const textChildren = card.children
      .filter((child) => child.type === "text")
      .map((child) => child.content);

    expect(textChildren[0]).toContain("first_last@outlook.com");
    expect(textChildren[0]).toContain("Plan [draft]");
    expect(textChildren[1]).toContain("foo_bar *soon* [ok]");
  });
});

describe("pending email handled state helpers", () => {
  it("uses reply-specific sent copy", () => {
    expect(getPendingEmailHandledTitle("reply_email")).toBe("Reply sent");
    expect(getPendingEmailHandledStatus("reply_email")).toBe("Reply sent.");
  });

  it("builds a mailbox deep link when confirmation ids are present", () => {
    expect(
      getPendingEmailHandledOpenText({
        accountEmail: "user@example.com",
        accountProvider: "google",
        confirmationResult: {
          messageId: "message-1",
          threadId: "thread-1",
        },
      }),
    ).toBe(
      "Open in Gmail: https://mail.google.com/mail/u/?authuser=user%40example.com#all/message-1",
    );
  });

  it("renders the sent Gmail link as an action button in Slack", () => {
    const card = buildHandledPendingEmailCard({
      accountEmail: "user@example.com",
      accountProvider: "google",
      confirmationResult: {
        messageId: "message-1",
        threadId: "thread-1",
      },
      messagingProvider: "slack",
      part: {
        type: "tool-sendEmail",
        state: "output-available",
        toolCallId: "tool-call-1",
        output: {
          confirmationState: "pending",
          pendingAction: {
            to: "recipient@example.com",
            subject: "Test subject",
            messageHtml: "<p>Test body</p>",
          },
        },
      },
    });

    const actionChildren = card.children.filter(
      (child) => child.type === "actions",
    );
    const textChildren = card.children.filter((child) => child.type === "text");

    expect(actionChildren).toEqual([
      expect.objectContaining({
        children: [
          expect.objectContaining({
            type: "link-button",
            label: "Open in Gmail",
            url: "https://mail.google.com/mail/u/?authuser=user%40example.com#all/message-1",
          }),
        ],
      }),
    ]);
    expect(JSON.stringify(textChildren)).not.toContain(
      "https://mail.google.com/mail/u/?authuser=user%40example.com#all/message-1",
    );
  });

  it("renders the sent Outlook link as an action button in Telegram", () => {
    const card = buildHandledPendingEmailCard({
      accountEmail: "user@example.com",
      accountProvider: "microsoft",
      confirmationResult: {
        messageId: "message-1",
        threadId: "thread-1",
      },
      messagingProvider: "telegram",
      part: {
        type: "tool-replyEmail",
        state: "output-available",
        toolCallId: "tool-call-1",
        output: {
          confirmationState: "pending",
          pendingAction: {
            subject: "Re: Test subject",
            messageHtml: "<p>Test body</p>",
          },
          reference: {
            from: "sender@example.com",
            subject: "Test subject",
          },
        },
      },
    });

    const actionChildren = card.children.filter(
      (child) => child.type === "actions",
    );
    const textChildren = card.children.filter((child) => child.type === "text");

    expect(actionChildren).toEqual([
      expect.objectContaining({
        children: [
          expect.objectContaining({
            type: "link-button",
            label: "Open in Outlook",
            url: "https://outlook.live.com/mail/0/inbox/id/message-1",
          }),
        ],
      }),
    ]);
    expect(JSON.stringify(textChildren)).not.toContain(
      "https://outlook.live.com/mail/0/inbox/id/message-1",
    );
  });

  it("returns null when the sent message ids are unavailable", () => {
    expect(
      getPendingEmailHandledOpenText({
        accountEmail: "user@example.com",
        accountProvider: "google",
        confirmationResult: null,
      }),
    ).toBeNull();
  });
});

describe("hasUnsupportedMessagingAttachment", () => {
  it("returns true when Slack raw payload includes non-image files", () => {
    expect(
      hasUnsupportedMessagingAttachment({
        provider: "slack",
        message: {
          attachments: [],
          raw: {
            type: "message",
            files: [{ id: "F123" }],
          },
        } as any,
      }),
    ).toBe(true);
  });

  it("returns false when Slack raw payload includes only image files", () => {
    expect(
      hasUnsupportedMessagingAttachment({
        provider: "slack",
        message: {
          attachments: [],
          raw: {
            type: "message",
            files: [{ id: "F123", mimetype: "image/png" }],
          },
        } as any,
      }),
    ).toBe(false);
  });

  it("returns true when Telegram raw payload includes a document", () => {
    expect(
      hasUnsupportedMessagingAttachment({
        provider: "telegram",
        message: {
          attachments: [],
          raw: {
            message_id: 1,
            date: 1,
            chat: { id: 1, type: "private", first_name: "Test" },
            document: { file_id: "doc-1" },
          },
        } as any,
      }),
    ).toBe(true);
  });

  it("returns false when no attachment metadata is present", () => {
    expect(
      hasUnsupportedMessagingAttachment({
        provider: "telegram",
        message: {
          attachments: [],
          raw: {
            message_id: 1,
            date: 1,
            chat: { id: 1, type: "private", first_name: "Test" },
            text: "hello",
          },
        } as any,
      }),
    ).toBe(false);
  });

  it("returns false when Chat SDK attachments are all images", () => {
    expect(
      hasUnsupportedMessagingAttachment({
        provider: "slack",
        message: {
          attachments: [
            { type: "image", mimeType: "image/jpeg", name: "photo.jpg" },
          ],
          raw: { type: "message" },
        } as any,
      }),
    ).toBe(false);
  });

  it("returns true when Chat SDK attachments include non-image types", () => {
    expect(
      hasUnsupportedMessagingAttachment({
        provider: "slack",
        message: {
          attachments: [
            { type: "file", mimeType: "application/pdf", name: "doc.pdf" },
          ],
          raw: { type: "message" },
        } as any,
      }),
    ).toBe(true);
  });
});
