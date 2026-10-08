import { cardToBlockKit } from "@chat-adapter/slack";
import type { KnownBlock } from "@slack/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  buildAffirmativeReactionMessage,
  buildHandledPendingEmailCard,
  buildPendingEmailConfirmationCard,
  buildPendingEmailCardFallbackText,
  buildMessagingUserMessages,
  getMessagingAiGeneratedPostPayload,
  getPendingEmailHandledOpenText,
  getPendingEmailHandledStatus,
  getPendingEmailHandledTitle,
  buildPendingEmailSummary,
  ensureSlackTeamInstallation,
  hasUnsupportedMessagingAttachment,
  normalizeMessagingAssistantText,
  normalizeMessagingUserText,
  postPendingEmailCard,
  stripLeadingSlackMention,
} from "@/utils/messaging/chat-sdk/bot";

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

    await ensureSlackTeamInstallation("T-TEAM", createTestLogger());

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

  it("formats inline rule suggestions as readable messaging text", () => {
    const output = normalizeMessagingAssistantText({
      text: [
        "Here are a few suggestions.",
        "",
        "<rule-suggestions>",
        "<rule-suggestion",
        'name="Monitoring"',
        'when="mention alerts from monitoring tools"',
        'label="Monitoring"',
        'archive="true" />',
        "<rule-suggestion",
        'name="Digest Updates"',
        'when="summary emails from Inbox Zero"',
        'label="Notification"',
        "archive={false}",
        "/>",
        "</rule-suggestions>",
        "",
        "Want me to create either one?",
      ].join("\n"),
    });

    expect(output).toContain("Here are a few suggestions.");
    expect(output).toContain("Suggested rules:");
    expect(output).toContain("**Monitoring**");
    expect(output).toContain("When: mention alerts from monitoring tools");
    expect(output).toContain("Then: Label as 'Monitoring', Archive");
    expect(output).toContain("**Digest Updates**");
    expect(output).toContain("When: summary emails from Inbox Zero");
    expect(output).toContain("Then: Label as 'Notification'");
    expect(output).toContain("Want me to create either one?");
    expect(output).not.toContain("<rule-suggestion");
    expect(output).not.toContain("</rule-suggestions>");
    expect(output).not.toContain("Then: Label as 'Notification', Archive");
  });

  it("formats standalone free-form rule suggestions", () => {
    expect(
      normalizeMessagingAssistantText({
        text: '<rule-suggestion name="Road Trip Plans" when="emails discussing road trips" do="move to Travels and notify Telegram" />',
      }),
    ).toBe(
      "Suggested rule:\n**Road Trip Plans**\nWhen: emails discussing road trips\nThen: move to Travels and notify Telegram",
    );
  });

  it("formats differently-cased rule suggestion tags", () => {
    expect(
      normalizeMessagingAssistantText({
        text: '<Rule-Suggestion name="Monitoring" when="alerts" archive="true" />',
      }),
    ).toBe("Suggested rule:\n**Monitoring**\nWhen: alerts\nThen: Archive");
  });

  it("treats shorthand boolean rule suggestion attributes as enabled", () => {
    expect(
      normalizeMessagingAssistantText({
        text: '<rule-suggestion name="Updates" when="low-priority updates" archive draft markread />',
      }),
    ).toBe(
      "Suggested rule:\n**Updates**\nWhen: low-priority updates\nThen: Archive, Draft Reply, Mark Read",
    );
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
    expect(textChildren[0]).toContain("Plan \\[draft\\]");
    expect(textChildren[1]).toContain("foo\\_bar \\*soon\\* \\[ok\\]");
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

    const cardText = JSON.stringify(card.children);
    expect(cardText).not.toContain("AI-generated content may be inaccurate");
  });

  it("adds an AI content disclosure to Teams pending email cards", () => {
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
            subject: "Plan",
            messageHtml: "<p>Use foo soon</p>",
          },
        },
      },
      provider: "teams",
    });

    const cardText = JSON.stringify(card.children);
    expect(cardText).toContain("AI-generated content may be inaccurate");
    expect(cardText).toContain("Report objectionable AI-generated content");
  });
});

describe("postPendingEmailCard", () => {
  it.each([
    "tool-sendEmail",
    "tool-replyEmail",
    "tool-forwardEmail",
  ] as const)("shows the complete four-paragraph Slack draft for %s with Send", async (type) => {
    const content = [
      "Hello team, I am writing to request an update on the project. Please share progress against the agreed milestones, including any work that has been completed since our last check-in. This will help us prepare an accurate overview for the next planning meeting.",
      "Could you also outline the tasks that remain in progress and the expected dates for completion? If the timeline has changed, please explain the dependencies involved so we can coordinate the next steps and make sure everyone has the resources they need.",
      "Please include any blockers or risks that could affect delivery, along with the support you would find helpful. We can use your update to agree on practical next steps, clarify ownership, and resolve open questions before they become larger scheduling issues.",
      "Thank you for your work on this project. Please send the update by the end of the week so we can review it together and confirm our priorities for the coming days. I appreciate your help keeping the team informed and look forward to hearing about the progress.",
    ].join("\n\n");
    const { post, args } = getPendingEmailCardFixture(content, "slack", type);
    expect(await postPendingEmailCard(args)).toBe(true);
    expect(post).toHaveBeenCalledTimes(1);
    const blocks = cardToBlockKit(post.mock.calls[0][0]) as KnownBlock[];
    const draft = blocks
      .filter((block) => block.type === "section")
      .slice(1)
      .map((block) => (block.type === "section" ? block.text?.text : ""))
      .join("");
    expect(draft.replace(/\s+/g, " ")).toBe(content.replace(/\s+/g, " "));
    expect(draft.split("\n\n")).toHaveLength(4);
    expect(blocks.at(-1)).toMatchObject({
      type: "actions",
      elements: [
        expect.objectContaining({
          text: expect.objectContaining({ text: "Send" }),
        }),
      ],
    });
  });

  it.each([
    3000, 3001, 141_000, 141_001, 180_000,
  ])("shows all %i draft characters within Slack's section and block limits", async (length) => {
    const content = "x".repeat(length);
    const { post, args } = getPendingEmailCardFixture(content);
    await postPendingEmailCard(args);
    const cards = post.mock.calls.map(
      ([card]) => cardToBlockKit(card) as KnownBlock[],
    );
    const draft = cards
      .flatMap((blocks) =>
        blocks.filter((block) => block.type === "section").slice(1),
      )
      .map((block) => (block.type === "section" ? block.text?.text : ""))
      .join("");
    expect(draft).toHaveLength(length);
    expect(draft).toBe(content);
    for (const blocks of cards) {
      expect(blocks.length).toBeLessThanOrEqual(50);
      for (const block of blocks) {
        if (block.type === "section")
          expect(block.text?.text.length).toBeLessThanOrEqual(3000);
      }
    }
    expect(
      cards.flat().filter((block) => block.type === "actions"),
    ).toHaveLength(1);
    expect(cards.at(-1)?.at(-1)?.type).toBe("actions");
    expect(post).toHaveBeenCalledTimes(length > 141_000 ? 2 : 1);
  });

  it("keeps Unicode intact across Slack sections", async () => {
    const prefix = "x".repeat(2999);
    const { post, args } = getPendingEmailCardFixture(
      `${prefix}😀End of draft.`,
    );
    await postPendingEmailCard(args);
    const sections = cardToBlockKit(post.mock.calls[0][0])
      .filter((block) => block.type === "section")
      .slice(1);
    expect(sections).toMatchObject([
      { text: { text: prefix } },
      { text: { text: "😀End of draft." } },
    ]);
  });

  it("does not enable Send when a continuation card fails to post", async () => {
    const { post, args } = getPendingEmailCardFixture("x".repeat(180_000));
    post
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Demo post failure"));
    expect(await postPendingEmailCard(args)).toBe(false);
    const firstCard = cardToBlockKit(post.mock.calls[0][0]);
    expect(firstCard.some((block) => block.type === "actions")).toBe(false);
  });

  it.each([
    "slack",
    "telegram",
    "teams",
  ] as const)("keeps short drafts in one %s card", async (provider) => {
    const content = "Please send a status update.";
    const { post, args } = getPendingEmailCardFixture(content, provider);
    await postPendingEmailCard(args);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0].children[1]).toMatchObject({
      type: "text",
      content,
    });
  });

  it.each([
    "telegram",
    "teams",
  ] as const)("keeps long %s drafts within the existing preview limit", async (provider) => {
    const { post, args } = getPendingEmailCardFixture(
      "x".repeat(180_000),
      provider,
    );
    await postPendingEmailCard(args);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0].children[1]).toMatchObject({
      type: "text",
      content: `${"x".repeat(600)}...`,
    });
  });
});

describe("getMessagingAiGeneratedPostPayload", () => {
  it("adds an AI content disclosure to Teams assistant messages", () => {
    expect(
      getMessagingAiGeneratedPostPayload({
        provider: "teams",
        text: "Here is your summary.",
      }),
    ).toEqual({
      markdown: expect.stringContaining(
        "AI-generated content may be inaccurate",
      ),
    });
  });

  it("uses Slack text instead of markdown_text for assistant messages", () => {
    expect(
      getMessagingAiGeneratedPostPayload({
        provider: "slack",
        text: "**Here is your summary.**",
      }),
    ).toEqual({
      raw: "*Here is your summary.*",
    });
  });

  it("does not add the Teams disclosure to Telegram assistant messages", () => {
    const payload = getMessagingAiGeneratedPostPayload({
      provider: "telegram",
      text: "Here is your summary.",
    });

    expect(payload).toBe("Here is your summary.");
  });
});

describe("pending email handled state helpers", () => {
  it("uses reply-specific sent copy", () => {
    expect(getPendingEmailHandledTitle("reply_email")).toBe("Reply sent");
    expect(getPendingEmailHandledStatus("reply_email")).toBe("Reply sent. ✅");
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
            url: "https://outlook.office.com/mail/inbox/id/message-1",
          }),
        ],
      }),
    ]);
    expect(JSON.stringify(textChildren)).not.toContain(
      "https://outlook.office.com/mail/inbox/id/message-1",
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

function getPendingEmailCardFixture(
  content: string,
  provider: Parameters<typeof postPendingEmailCard>[0]["provider"] = "slack",
  type: Parameters<
    typeof postPendingEmailCard
  >[0]["part"]["type"] = "tool-replyEmail",
) {
  const post = vi
    .fn<
      (
        card: ReturnType<typeof buildPendingEmailConfirmationCard>,
      ) => Promise<void>
    >()
    .mockResolvedValue(undefined);
  const args: Parameters<typeof postPendingEmailCard>[0] = {
    thread: { post } as unknown as Parameters<
      typeof postPendingEmailCard
    >[0]["thread"],
    chatMessageId: "demo-message",
    part: {
      type,
      state: "output-available",
      toolCallId: "demo-tool-call",
      output: {
        confirmationState: "pending",
        pendingAction: {
          to: "team@example.com",
          subject: "Project status update",
          messageHtml: content
            .split("\n\n")
            .map((paragraph) => `<p>${paragraph}</p>`)
            .join(""),
          content,
        },
      },
    },
    provider,
    logger: createTestLogger(),
  };
  return { post, args };
}
