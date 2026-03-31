import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  buildPendingEmailCardFallbackText,
  getPendingEmailHandledOpenText,
  getPendingEmailHandledStatus,
  getPendingEmailHandledTitle,
  buildPendingEmailSummary,
  ensureSlackTeamInstallation,
  hasUnsupportedMessagingAttachment,
  normalizeMessagingAssistantText,
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
      "Open in Gmail: https://mail.google.com/mail/u/user@example.com/#all/message-1",
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
