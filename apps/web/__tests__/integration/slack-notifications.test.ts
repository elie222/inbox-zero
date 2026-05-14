/**
 * Integration test: Slack notification flows via @inbox-zero/emulate
 *
 * Tests real app notification flows — message formatting, Block Kit
 * construction, and delivery — against a local Slack emulator.
 *
 * Usage:
 *   pnpm test-integration slack-notifications
 */

import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { cardToBlockKit, cardToFallbackText } from "@chat-adapter/slack";
import type { WebClient } from "@slack/web-api";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  ActionType,
  DraftEmailStatus,
  MessagingMessageStatus,
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import {
  createGmailTestHarness,
  createSlackTestHarness,
  type SlackTestHarness,
} from "./helpers";

vi.mock("@/utils/prisma");
vi.mock("@/utils/rule/rule-history", () => ({
  createRuleHistory: vi.fn().mockResolvedValue(undefined),
}));

// Mock createSlackClient so production functions use our emulator-bound client
let emulatorClient: WebClient;
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: () => emulatorClient,
}));

const mockCreateEmailProvider = vi.fn();
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: unknown[]) => mockCreateEmailProvider(...args),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "true";
const TEST_PORT = 4098;
const logger = createTestLogger();

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Slack notification flows",
  { timeout: 30_000 },
  () => {
    let slackHarness: SlackTestHarness;
    let notifChannelId: string;
    let engChannelId: string;

    beforeAll(async () => {
      slackHarness = await createSlackTestHarness({
        port: TEST_PORT,
        team: { name: "TestWorkspace", domain: "test-workspace" },
        users: [
          {
            name: "alice",
            real_name: "Alice Smith",
            email: "alice@example.com",
          },
        ],
        channels: [
          {
            name: "inbox-zero-notifications",
            is_private: true,
            topic: "Inbox Zero alerts",
          },
          {
            name: "engineering",
            is_private: false,
            topic: "Engineering discussion",
          },
        ],
      });

      emulatorClient = slackHarness.client;
      notifChannelId = slackHarness.channelsByName["inbox-zero-notifications"];
      engChannelId = slackHarness.channelsByName.engineering;
      if (!notifChannelId || !engChannelId) {
        throw new Error("Slack emulator channels not found");
      }
    });

    afterAll(async () => {
      await slackHarness?.emulator.close();
    });

    beforeEach(() => {
      vi.clearAllMocks();
    });

    test("sendChannelConfirmation delivers onboarding message", async () => {
      const { sendChannelConfirmation } = await import(
        "@/utils/messaging/providers/slack/send"
      );

      await sendChannelConfirmation({
        accessToken: "emulator-token",
        channelId: notifChannelId,
        botUserId: "UAPP123",
      });

      const history = await emulatorClient.conversations.history({
        channel: notifChannelId,
      });
      const msg = history.messages!.find((m) =>
        m.text?.includes("Inbox Zero connected"),
      );
      expect(msg).toBeDefined();
      expect(msg?.text).toContain("<@UAPP123>");
    });

    test("sendMeetingBriefingToSlack delivers structured briefing with guest data", async () => {
      const { sendMeetingBriefingToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );

      await sendMeetingBriefingToSlack({
        accessToken: "emulator-token",
        channelId: notifChannelId,
        meetingTitle: "Sprint Planning",
        formattedTime: "2:00 PM",
        videoConferenceLink: "https://meet.example.com/sprint",
        eventUrl: "https://calendar.example.com/event/123",
        briefingContent: {
          guests: [
            {
              name: "Jane Doe",
              email: "jane@partner.com",
              bullets: [
                "VP of Engineering at Partner Corp",
                "Previously discussed Q2 roadmap alignment",
              ],
            },
          ],
          internalTeamMembers: [
            { name: "Alice Smith", email: "alice@example.com" },
          ],
        },
      });

      const history = await emulatorClient.conversations.history({
        channel: notifChannelId,
      });
      const msg = history.messages!.find((m) =>
        m.text?.includes("Sprint Planning"),
      );
      expect(msg).toBeDefined();
      expect(msg!.text).toContain("2:00 PM");
    });

    test("sendDocumentFiledToSlack delivers filing confirmation with path", async () => {
      const { sendDocumentFiledToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );

      await sendDocumentFiledToSlack({
        accessToken: "emulator-token",
        channelId: engChannelId,
        filename: "invoice-2026-03.pdf",
        folderPath: "Finance/Invoices/2026",
        driveProvider: "google",
        senderEmail: "vendor@example.com",
        fileId: "abc123",
      });

      const history = await emulatorClient.conversations.history({
        channel: engChannelId,
      });
      const msg = history.messages!.find((m) =>
        m.text?.includes("invoice-2026-03.pdf"),
      );
      expect(msg).toBeDefined();
      expect(msg!.text).toContain("Finance/Invoices/2026");
    });

    test("sendDocumentAskToSlack delivers ambiguous filing prompt", async () => {
      const { sendDocumentAskToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );

      await sendDocumentAskToSlack({
        accessToken: "emulator-token",
        channelId: engChannelId,
        filename: "contract-draft-v2.docx",
        reasoning:
          "This looks like a legal contract but I'm not sure which folder it belongs in.",
      });

      const history = await emulatorClient.conversations.history({
        channel: engChannelId,
      });
      const msg = history.messages!.find((m) =>
        m.text?.includes("contract-draft-v2.docx"),
      );
      expect(msg).toBeDefined();
    });

    test("sendDigestToSlack delivers rule-grouped digest with items", async () => {
      const { sendDigestToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );
      const postMessageSpy = vi.spyOn(emulatorClient.chat, "postMessage");

      await sendDigestToSlack({
        accessToken: "emulator-token",
        channelId: notifChannelId,
        date: new Date("2026-04-21T09:00:00Z"),
        ruleNames: {
          newsletters: "Newsletters",
          receipts: "Receipts",
        },
        itemsByRule: {
          newsletters: [
            { from: "Acme Weekly", subject: "This week in tech", content: "" },
            {
              from: "Morning Brew",
              subject: "Morning Brew · Apr 21",
              content: "",
            },
          ],
          receipts: [
            { from: "Stripe", subject: "Your receipt from Acme", content: "" },
          ],
        },
      });

      const history = await emulatorClient.conversations.history({
        channel: notifChannelId,
      });
      expect(
        history.messages!.some((m) =>
          m.text?.includes("Your Inbox Zero digest"),
        ),
      ).toBe(true);

      const posted = postMessageSpy.mock.calls.at(-1)?.[0];
      const blocks = JSON.stringify(posted?.blocks ?? []);
      expect(blocks).toContain("Newsletters");
      expect(blocks).toContain("Receipts");
      expect(blocks).toContain("Morning Brew");
      expect(blocks).toContain("Your receipt from Acme");
      expect(blocks).toContain("Generated by Inbox Zero");
      expect(blocks).not.toContain("Unsubscribe");
      expect(blocks).not.toContain("/api/unsubscribe");
    });

    test("sendFollowUpReminderToSlack surfaces AWAITING vs NEEDS_REPLY header", async () => {
      const { sendFollowUpReminderToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );
      const { ThreadTrackerType } = await import("@/generated/prisma/enums");
      const postMessageSpy = vi.spyOn(emulatorClient.chat, "postMessage");

      await sendFollowUpReminderToSlack({
        accessToken: "emulator-token",
        channelId: notifChannelId,
        subject: "Contract terms",
        counterpartyName: "Jane Partner",
        counterpartyEmail: "jane@partner.com",
        trackerType: ThreadTrackerType.AWAITING,
        daysSinceSent: 4,
        snippet: "Wanted to check whether the redlines have landed.",
        threadLink: "https://mail.example.com/thread/awaiting",
        trackerId: "tracker-awaiting",
      });

      await sendFollowUpReminderToSlack({
        accessToken: "emulator-token",
        channelId: notifChannelId,
        subject: "Onboarding questions",
        counterpartyName: "Alex Customer",
        counterpartyEmail: "alex@customer.com",
        trackerType: ThreadTrackerType.NEEDS_REPLY,
        daysSinceSent: 1,
        snippet: "Could you walk me through the SSO setup?",
        threadLink: "https://mail.example.com/thread/needs-reply",
        trackerId: "tracker-needs-reply",
      });

      const history = await emulatorClient.conversations.history({
        channel: notifChannelId,
      });
      expect(
        history.messages!.some((m) => m.text?.includes("Contract terms")),
      ).toBe(true);
      expect(
        history.messages!.some((m) => m.text?.includes("Onboarding questions")),
      ).toBe(true);

      const awaitingCall = postMessageSpy.mock.calls.find((c) =>
        c[0].text?.includes("Contract terms"),
      );
      const needsReplyCall = postMessageSpy.mock.calls.find((c) =>
        c[0].text?.includes("Onboarding questions"),
      );
      expect(awaitingCall).toBeDefined();
      expect(needsReplyCall).toBeDefined();

      const awaitingBlocks = JSON.stringify(awaitingCall![0].blocks);
      expect(awaitingBlocks).toContain("Follow-up: waiting for their reply");
      expect(awaitingBlocks).toContain("4 days ago");
      expect(awaitingBlocks).toContain("Jane Partner");
      expect(awaitingBlocks).toContain("jane@partner.com");
      // AWAITING: the user emailed Jane, so the reminder should make that clear.
      expect(awaitingBlocks).toContain("You sent this email to *Jane Partner*");
      expect(awaitingBlocks).not.toContain(
        "You received this email from *Jane Partner*",
      );
      expect(awaitingBlocks).toContain(
        "Wanted to check whether the redlines have landed.",
      );
      expect(awaitingBlocks).toContain(
        "https://mail.example.com/thread/awaiting",
      );

      const needsReplyBlocks = JSON.stringify(needsReplyCall![0].blocks);
      expect(needsReplyBlocks).toContain("Follow-up: reply needed from you");
      expect(needsReplyBlocks).toContain("1 day ago");
      expect(needsReplyBlocks).toContain(
        "You received this email from *Alex Customer*",
      );
      expect(needsReplyBlocks).toContain(
        "Could you walk me through the SSO setup?",
      );
    });

    test("Mark done click resolves the tracker and confirms via ephemeral", async () => {
      const { sendFollowUpReminderToSlack } = await import(
        "@/utils/messaging/providers/slack/send"
      );
      const { ThreadTrackerType } = await import("@/generated/prisma/enums");
      const { FOLLOW_UP_MARK_DONE_ACTION_ID, handleFollowUpReminderAction } =
        await import("@/utils/follow-up/follow-up-actions");
      const postMessageSpy = vi.spyOn(emulatorClient.chat, "postMessage");

      const trackerId = "tracker-mark-done";

      await sendFollowUpReminderToSlack({
        accessToken: "emulator-token",
        channelId: notifChannelId,
        subject: "Pricing question",
        counterpartyName: "Sam Prospect",
        counterpartyEmail: "sam@prospect.com",
        trackerType: ThreadTrackerType.AWAITING,
        daysSinceSent: 5,
        snippet: "Following up on the quote we sent.",
        threadLink: "https://mail.example.com/thread/mark-done",
        trackerId,
      });

      // Read the rendered Mark done button payload from what was actually
      // posted to Slack — this catches drift between renderer and handler.
      const postedCall = postMessageSpy.mock.calls.find((c) =>
        c[0].text?.includes("Pricing question"),
      );
      expect(postedCall).toBeDefined();
      const buttons = ((postedCall![0].blocks as unknown[]) ?? []).flatMap(
        (block) => {
          if (
            block &&
            typeof block === "object" &&
            "type" in block &&
            (block as { type: string }).type === "actions" &&
            "elements" in block &&
            Array.isArray((block as { elements: unknown[] }).elements)
          ) {
            return (block as { elements: unknown[] }).elements;
          }
          return [];
        },
      );
      const markDoneButton = buttons.find(
        (b: any) => b?.action_id === FOLLOW_UP_MARK_DONE_ACTION_ID,
      ) as { action_id: string; value: string; text: { text: string } };
      expect(markDoneButton).toBeDefined();
      expect(markDoneButton.text.text).toBe("Mark done");
      expect(markDoneButton.value).toBe(trackerId);

      // Mock the prisma lookups the handler relies on.
      prisma.threadTracker.findUnique.mockResolvedValue({
        id: trackerId,
        resolved: false,
        emailAccountId: "account-1",
      } as never);
      prisma.messagingChannel.findFirst.mockResolvedValue({
        id: "channel-1",
      } as never);
      prisma.threadTracker.update.mockResolvedValue({} as never);

      const postEphemeral = vi.fn().mockResolvedValue(undefined);
      const post = vi.fn().mockResolvedValue(undefined);
      const editMessage = vi.fn().mockResolvedValue(undefined);

      const threadId = postedCall![0].channel ?? notifChannelId;
      const messageId = "1700000000.000100";

      await handleFollowUpReminderAction({
        event: {
          actionId: markDoneButton.action_id,
          value: markDoneButton.value,
          user: { userId: "U_USER" },
          raw: { team: { id: "T_TEAM" } },
          threadId,
          messageId,
          adapter: { name: "slack", editMessage },
          thread: { postEphemeral, post },
        } as any,
        logger,
      });

      // Auth lookup scoped to tracker's account, slack, the click team and user.
      expect(prisma.messagingChannel.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            emailAccountId: "account-1",
            teamId: "T_TEAM",
            providerUserId: "U_USER",
            isConnected: true,
          }),
        }),
      );

      // Tracker flipped to resolved.
      expect(prisma.threadTracker.update).toHaveBeenCalledWith({
        where: { id: trackerId },
        data: { resolved: true },
      });

      expect(editMessage).toHaveBeenCalledTimes(1);
      const editArgs = editMessage.mock.calls[0];
      expect(editArgs?.[0]).toBe(threadId);
      expect(editArgs?.[1]).toBe(messageId);
      expect(JSON.stringify(editArgs?.[2])).toMatch(/done/i);

      // User saw an ephemeral confirmation.
      expect(postEphemeral).toHaveBeenCalled();
      expect(postEphemeral.mock.calls[0]?.[1]).toMatch(/done/i);
    });

    test("addReaction/removeReaction manages processing indicator", async () => {
      const { addReaction, removeReaction } = await import(
        "@/utils/messaging/providers/slack/reactions"
      );

      // Post a message to react to
      const posted = await emulatorClient.chat.postMessage({
        channel: engChannelId,
        text: "Processing this email...",
      });
      const ts = posted.ts!;

      // Add "eyes" reaction (processing indicator)
      await addReaction(emulatorClient, engChannelId, ts, "eyes");

      const reactions = await emulatorClient.reactions.get({
        channel: engChannelId,
        timestamp: ts,
      });
      const eyesReaction = reactions.message?.reactions?.find(
        (r) => r.name === "eyes",
      );
      expect(eyesReaction).toBeDefined();

      // Remove it (processing done)
      await removeReaction(emulatorClient, engChannelId, ts, "eyes");

      const after = await emulatorClient.reactions.get({
        channel: engChannelId,
        timestamp: ts,
      });
      const eyesAfter = after.message?.reactions?.find(
        (r) => r.name === "eyes",
      );
      expect(eyesAfter).toBeUndefined();
    });

    test("addReaction silently handles errors for missing messages", async () => {
      const { addReaction } = await import(
        "@/utils/messaging/providers/slack/reactions"
      );

      // Should not throw — addReaction swallows errors
      await expect(
        addReaction(emulatorClient, engChannelId, "9999999999.999999", "eyes"),
      ).resolves.toBeUndefined();
    });

    test("sendSlackRuleNotification posts a draft card with interactive actions", async () => {
      const { sendMessagingRuleNotification } = await import(
        "@/utils/messaging/rule-notifications"
      );

      const subject = getUniqueSubject("Draft card");
      const postMessageSpy = vi.spyOn(emulatorClient.chat, "postMessage");

      prisma.executedAction.findUnique.mockResolvedValue(
        getNotificationContext({
          id: "draft-action-1",
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          content: "Thanks for the note.\n\nI can help with that.",
          channelId: notifChannelId,
          threadId: "draft-thread-1",
        }),
      );
      prisma.executedAction.findFirst.mockResolvedValue(null);
      prisma.executedAction.update.mockResolvedValue({} as never);

      await sendMessagingRuleNotification({
        executedActionId: "draft-action-1",
        email: {
          headers: {
            from: "sender@example.com",
            subject,
          },
          snippet: "Can you help with this request?",
        },
        logger,
      });

      const message = await findMessageBySubject({
        channelId: notifChannelId,
        subject,
      });
      const postArgs = postMessageSpy.mock.calls[0]?.[0];

      expect(message).toBeDefined();
      expect(message?.text).toContain("I drafted a reply for you");
      expect(message?.text).toContain("*sender@example.com*");
      expect(message?.text).toContain(`*Subject:* ${subject}`);
      expect(message?.text).toContain("They wrote:");
      expect(message?.text).toContain("Can you help with this request?");
      expect(message?.text).toContain("I drafted a reply for you:");
      expect(getActionLabels(postArgs?.blocks)).toEqual(
        expect.arrayContaining(["Send reply", "Edit draft", "Dismiss"]),
      );
      expect(prisma.executedAction.update).toHaveBeenCalledWith({
        where: { id: "draft-action-1" },
        data: {
          messagingMessageId: expect.any(String),
          messagingMessageSentAt: expect.any(Date),
          messagingMessageStatus: "SENT",
        },
      });
    });

    test("edited Slack drafts send the synced Gmail draft", async () => {
      const {
        sendMessagingRuleNotification,
        handleRuleNotificationAction,
        handleSlackRuleNotificationModalSubmit,
      } = await import("@/utils/messaging/rule-notifications");

      const gmailEmail = "slack-draft-send@example.com";
      const subject = getUniqueSubject("Edited draft");
      const editedContent = "I reviewed this and sent the update.";
      const gmailHarness = await createGmailTestHarness({
        port: 4112,
        email: gmailEmail,
        messages: [
          {
            id: "msg_original",
            user_email: gmailEmail,
            from: "sender@example.com",
            to: gmailEmail,
            subject,
            body_text: "Can you send the update back to me?",
            body_html: "<p>Can you send the update back to me?</p>",
            label_ids: ["INBOX", "UNREAD"],
            internal_date: "1711900000000",
          },
        ],
      });

      try {
        mockCreateEmailProvider.mockResolvedValue(gmailHarness.provider);

        const sourceMessage =
          await gmailHarness.provider.getMessage("msg_original");
        const createdDraft = await gmailHarness.provider.createDraft({
          to: "sender@example.com",
          subject: `Re: ${subject}`,
          messageHtml: "<p>Initial draft body.</p>",
          replyToMessageId: sourceMessage.id,
        });

        const siblingDraftActionState = {
          id: "email-draft-action-edit-send",
          draftId: createdDraft.id,
          subject: `Re: ${subject}`,
          content: "Initial draft body.",
          draftStatus: DraftEmailStatus.PENDING as DraftEmailStatus | null,
        };

        const slackActionState = {
          id: "draft-action-edit-send",
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          content: "Initial draft body.",
          subject: null as string | null,
          to: null as string | null,
          cc: null as string | null,
          bcc: null as string | null,
          draftId: null as string | null,
          staticAttachments: null as unknown,
          messagingChannelId: "channel-1",
          messagingMessageId: null as string | null,
          messagingMessageStatus: null as MessagingMessageStatus | null,
          draftStatus: null as DraftEmailStatus | null,
          executedRule: {
            id: "executed-rule-edit-send",
            ruleId: "rule-1",
            messageId: sourceMessage.id,
            threadId: sourceMessage.threadId,
            emailAccount: {
              id: "email-account-1",
              userId: "user-1",
              email: gmailEmail,
              account: {
                provider: "google",
              },
            },
            rule: {
              systemType: null,
            },
            actionItems: [
              {
                id: siblingDraftActionState.id,
                draftId: siblingDraftActionState.draftId,
                subject: siblingDraftActionState.subject,
              },
            ],
          },
          messagingChannel: {
            id: "channel-1",
            emailAccountId: "email-account-1",
            provider: MessagingProvider.SLACK,
            isConnected: true,
            teamId: "team-1",
            providerUserId: "user-1",
            accessToken: "emulator-token",
            routes: [
              {
                purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
                targetType: MessagingRouteTargetType.CHANNEL,
                targetId: notifChannelId,
              },
            ],
          },
        };

        prisma.executedAction.findUnique.mockImplementation(
          async ({ where }) => {
            if (where?.id !== slackActionState.id) return null;

            return {
              id: slackActionState.id,
              type: slackActionState.type,
              content: slackActionState.content,
              subject: slackActionState.subject,
              to: slackActionState.to,
              cc: slackActionState.cc,
              bcc: slackActionState.bcc,
              draftId: slackActionState.draftId,
              staticAttachments: slackActionState.staticAttachments,
              messagingChannelId: slackActionState.messagingChannelId,
              messagingMessageStatus: slackActionState.messagingMessageStatus,
              executedRule: slackActionState.executedRule,
              messagingChannel: slackActionState.messagingChannel,
            } as never;
          },
        );

        prisma.executedAction.findFirst.mockImplementation(
          async ({ where }) => {
            if (
              where?.executedRuleId === slackActionState.executedRule.id &&
              where?.type === ActionType.DRAFT_EMAIL &&
              where?.draftId?.not === null
            ) {
              return {
                id: siblingDraftActionState.id,
                draftId: siblingDraftActionState.draftId,
                subject: siblingDraftActionState.subject,
              } as never;
            }

            if (
              where?.messagingChannelId ===
                slackActionState.messagingChannelId &&
              where?.executedRule?.threadId ===
                slackActionState.executedRule.threadId &&
              slackActionState.messagingMessageId
            ) {
              return {
                messagingMessageId: slackActionState.messagingMessageId,
              } as never;
            }

            return null;
          },
        );

        prisma.executedAction.update.mockImplementation(
          async ({ where, data }) => {
            if (where?.id === slackActionState.id) {
              if (typeof data?.messagingMessageId === "string") {
                slackActionState.messagingMessageId = data.messagingMessageId;
              }
              if (data?.messagingMessageStatus) {
                slackActionState.messagingMessageStatus =
                  data.messagingMessageStatus as MessagingMessageStatus;
              }
              if (typeof data?.content === "string") {
                slackActionState.content = data.content;
              }
              if (data?.draftStatus) {
                slackActionState.draftStatus =
                  data.draftStatus as DraftEmailStatus;
              }
            }

            if (where?.id === siblingDraftActionState.id) {
              if (typeof data?.content === "string") {
                siblingDraftActionState.content = data.content;
              }
              if (data?.draftStatus) {
                siblingDraftActionState.draftStatus =
                  data.draftStatus as DraftEmailStatus;
              }
            }

            return {} as never;
          },
        );

        prisma.executedAction.updateMany.mockImplementation(
          async ({ where, data }) => {
            const ids = where?.id?.in ?? [];
            if (typeof data?.content === "string") {
              if (ids.includes(slackActionState.id)) {
                slackActionState.content = data.content;
              }
              if (ids.includes(siblingDraftActionState.id)) {
                siblingDraftActionState.content = data.content;
              }
            }

            return { count: ids.length } as never;
          },
        );

        await sendMessagingRuleNotification({
          executedActionId: slackActionState.id,
          email: {
            headers: {
              from: sourceMessage.headers.from,
              subject: sourceMessage.headers.subject,
            },
            snippet: sourceMessage.snippet,
          },
          logger,
        });

        const postedMessage = await findMessageBySubject({
          channelId: notifChannelId,
          subject,
        });

        expect(postedMessage?.text).toContain("Initial draft body.");

        const openModal = vi.fn().mockResolvedValue(undefined);
        await handleRuleNotificationAction({
          event: {
            actionId: "rule_draft_edit",
            value: slackActionState.id,
            user: { userId: "user-1" },
            raw: { team: { id: "team-1" } },
            adapter: { name: "slack" },
            openModal,
            thread: { postEphemeral: vi.fn() },
          } as any,
          logger,
        });

        expect(openModal).toHaveBeenCalledWith(
          expect.objectContaining({
            submitLabel: "Send reply",
          }),
        );

        const draftBeforeSend = await gmailHarness.provider.getDraft(
          createdDraft.id,
        );
        const sentMessageId = draftBeforeSend?.id;
        expect(sentMessageId).toBeDefined();

        const editResponse = await handleSlackRuleNotificationModalSubmit({
          event: {
            privateMetadata: slackActionState.id,
            values: {
              draft_content: editedContent,
            },
            user: { userId: "user-1" },
            raw: { team: { id: "team-1" } },
            relatedMessage: {
              edit: (card: unknown) =>
                updateSlackCardMessage({
                  channelId: notifChannelId,
                  messageId: postedMessage!.ts!,
                  card,
                }),
            },
          } as any,
          logger,
        });

        expect(editResponse).toEqual({ action: "close" });
        expect(slackActionState.messagingMessageStatus).toBe(
          MessagingMessageStatus.DRAFT_SENT,
        );
        expect(slackActionState.draftStatus).toBe(DraftEmailStatus.LIKELY_SENT);
        expect(siblingDraftActionState.draftStatus).toBe(
          DraftEmailStatus.LIKELY_SENT,
        );
        expect(
          await gmailHarness.provider.getDraft(createdDraft.id),
        ).toBeNull();

        const editedSlackMessage = await findMessageBySubject({
          channelId: notifChannelId,
          subject,
        });

        expect(editedSlackMessage?.text).toContain("Reply sent.");
        expect(editedSlackMessage?.text).toContain(editedContent);

        const sentReply = await gmailHarness.provider.getMessage(
          sentMessageId!,
        );

        expect(sentReply.headers.subject).toBe(`Re: ${subject}`);
        expect(sentReply.textPlain || sentReply.textHtml || "").toContain(
          editedContent,
        );
      } finally {
        await gmailHarness.emulator.close();
      }
    });

    test("sendMessagingRuleNotification posts a generic info card with archive actions", async () => {
      const { sendMessagingRuleNotification } = await import(
        "@/utils/messaging/rule-notifications"
      );

      const subject = getUniqueSubject("Info card");
      const postMessageSpy = vi.spyOn(emulatorClient.chat, "postMessage");

      prisma.executedAction.findUnique.mockResolvedValue(
        getNotificationContext({
          id: "notify-action-1",
          type: ActionType.NOTIFY_MESSAGING_CHANNEL,
          content: null,
          channelId: engChannelId,
          threadId: "notify-thread-1",
        }),
      );
      prisma.executedAction.findFirst.mockResolvedValue(null);
      prisma.executedAction.update.mockResolvedValue({} as never);

      await sendMessagingRuleNotification({
        executedActionId: "notify-action-1",
        email: {
          headers: {
            from: "updates@example.com",
            subject,
          },
          snippet: "This is the latest account update.",
        },
        logger,
      });

      const message = await findMessageBySubject({
        channelId: engChannelId,
        subject,
      });
      const postArgs = postMessageSpy.mock.calls[0]?.[0];

      expect(message).toBeDefined();
      expect(message?.text).toContain("New email for you");
      expect(message?.text).toContain(`*Subject:* ${subject}`);
      expect(getActionLabels(postArgs?.blocks)).toEqual([
        "Archive",
        "Mark read",
        "Open in Gmail",
        "Dismiss",
        "More",
      ]);
    });

    test("sendMessagingRuleNotification replies in a thread for later actions on the same email thread", async () => {
      const { sendMessagingRuleNotification } = await import(
        "@/utils/messaging/rule-notifications"
      );

      const firstSubject = getUniqueSubject("Thread root");
      const secondSubject = getUniqueSubject("Thread reply");
      let rootMessageId: string | null = null;

      prisma.executedAction.findUnique.mockImplementation(async ({ where }) => {
        const executedActionId = where?.id;
        if (executedActionId === "thread-action-1") {
          return getNotificationContext({
            id: "thread-action-1",
            type: ActionType.DRAFT_MESSAGING_CHANNEL,
            content: "First draft content",
            channelId: notifChannelId,
            threadId: "shared-thread-1",
          }) as never;
        }

        if (executedActionId === "thread-action-2") {
          return getNotificationContext({
            id: "thread-action-2",
            type: ActionType.DRAFT_MESSAGING_CHANNEL,
            content: "Second draft content",
            channelId: notifChannelId,
            threadId: "shared-thread-1",
          }) as never;
        }

        return null;
      });

      prisma.executedAction.findFirst.mockImplementation(async ({ where }) => {
        if (
          where?.messagingChannelId === "channel-1" &&
          where?.executedRule?.threadId === "shared-thread-1" &&
          rootMessageId
        ) {
          return { messagingMessageId: rootMessageId } as never;
        }

        return null;
      });

      prisma.executedAction.update.mockImplementation(
        async ({ data, where }) => {
          if (
            where?.id === "thread-action-1" &&
            typeof data?.messagingMessageId === "string"
          ) {
            rootMessageId = data.messagingMessageId;
          }
          return {} as never;
        },
      );

      await sendMessagingRuleNotification({
        executedActionId: "thread-action-1",
        email: {
          headers: {
            from: "sender@example.com",
            subject: firstSubject,
          },
          snippet: "First thread message",
        },
        logger,
      });

      await sendMessagingRuleNotification({
        executedActionId: "thread-action-2",
        email: {
          headers: {
            from: "sender@example.com",
            subject: secondSubject,
          },
          snippet: "Second thread message",
        },
        logger,
      });

      expect(rootMessageId).toBeTruthy();

      const replies = await emulatorClient.conversations.replies({
        channel: notifChannelId,
        ts: rootMessageId!,
      });

      const texts =
        replies.messages?.map((message) => message.text || "") || [];
      expect(texts.some((text) => text.includes(firstSubject))).toBe(true);
      expect(texts.some((text) => text.includes(secondSubject))).toBe(true);
      expect(replies.messages).toHaveLength(2);
      expect(prisma.executedAction.update).toHaveBeenLastCalledWith({
        where: { id: "thread-action-2" },
        data: {
          messagingMessageId: rootMessageId,
          messagingMessageSentAt: expect.any(Date),
          messagingMessageStatus: "SENT",
        },
      });
    });

    test("updating a draft messaging rule preserves the Slack destination through execution", async () => {
      const { updateRule } = await import("@/utils/rule/rule");
      const { runActionFunction } = await import("@/utils/ai/actions");

      const subject = getUniqueSubject("Persisted draft");
      const threadId = "persisted-thread-1";
      const emailAccountId = "email-account-1";
      const persistedRuleActionId = "persisted-rule-action-1";
      const executedActionId = "executed-action-1";
      let persistedMessagingChannelId: string | null = null;

      prisma.rule.update.mockImplementation(async ({ where, data }) => {
        const savedAction = {
          id: persistedRuleActionId,
          type: data.actions.createMany.data[0].type,
          messagingChannelId:
            data.actions.createMany.data[0].messagingChannelId ?? null,
          label: null,
          labelId: null,
          subject: data.actions.createMany.data[0].subject ?? null,
          content: data.actions.createMany.data[0].content ?? null,
          to: data.actions.createMany.data[0].to ?? null,
          cc: data.actions.createMany.data[0].cc ?? null,
          bcc: data.actions.createMany.data[0].bcc ?? null,
          url: data.actions.createMany.data[0].url ?? null,
          folderName: null,
          folderId: null,
          staticAttachments: null,
          delayInMinutes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ruleId: where.id,
        };

        persistedMessagingChannelId = savedAction.messagingChannelId;

        return {
          id: where.id,
          name: data.name ?? "To Reply",
          instructions: data.instructions ?? null,
          enabled: true,
          automate: true,
          runOnThreads: true,
          conditionalOperator: "AND",
          createdAt: new Date(),
          updatedAt: new Date(),
          emailAccountId,
          groupId: null,
          from: null,
          to: null,
          subject: null,
          body: null,
          categoryFilterType: null,
          systemType: null,
          promptText: null,
          actions: [savedAction],
          group: null,
        } as never;
      });

      prisma.executedAction.findUnique.mockImplementation(async ({ where }) => {
        if (where?.id !== executedActionId) return null;

        return getNotificationContext({
          id: executedActionId,
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          content: "Thanks for the note.\n\nI'll follow up shortly.",
          channelId: notifChannelId,
          threadId,
          messagingChannelId: persistedMessagingChannelId,
        }) as never;
      });
      prisma.executedAction.findFirst.mockResolvedValue(null);
      prisma.executedAction.update.mockResolvedValue({} as never);
      prisma.messagingChannel.findMany.mockResolvedValue([
        {
          id: "channel-1",
        },
      ] as never);

      const updatedRule = await updateRule({
        ruleId: "rule-1",
        result: {
          name: "To Reply",
          condition: {
            aiInstructions: null,
            conditionalOperator: null,
            static: {
              from: null,
              to: null,
              subject: null,
            },
          },
          actions: [
            {
              type: ActionType.DRAFT_MESSAGING_CHANNEL,
              messagingChannelId: "channel-1",
              fields: {
                content: "Thanks for the note.\n\nI'll follow up shortly.",
              } as any,
              delayInMinutes: null,
            },
          ],
        },
        emailAccountId,
        provider: "gmail",
        logger,
      });

      const persistedAction = updatedRule.actions[0];
      expect(persistedAction?.messagingChannelId).toBe("channel-1");

      await runActionFunction({
        client: {} as never,
        email: {
          id: "message-1",
          threadId,
          headers: {
            from: "sender@example.com",
            to: "user@example.com",
            subject,
            date: "2026-01-01T12:00:00.000Z",
            "message-id": "<message-1@example.com>",
          },
          textPlain: "Please reply when you can.",
          textHtml: "<p>Please reply when you can.</p>",
          snippet: "Please reply when you can.",
          attachments: [],
          internalDate: "1700000000000",
          rawRecipients: [],
        },
        action: {
          id: executedActionId,
          type: persistedAction.type,
          messagingChannelId: persistedAction.messagingChannelId,
          content: persistedAction.content,
        },
        emailAccount: {
          email: "user@example.com",
          id: emailAccountId,
          userId: "user-1",
        },
        executedRule: {
          id: "executed-rule-1",
          threadId,
          emailAccountId,
          ruleId: updatedRule.id,
        } as any,
        logger,
      });

      const message = await findMessageBySubject({
        channelId: notifChannelId,
        subject,
      });

      expect(message).toBeDefined();
      expect(message?.text).toContain("I drafted a reply for you");
      expect(prisma.executedAction.update).toHaveBeenCalledWith({
        where: { id: executedActionId },
        data: {
          messagingMessageId: expect.any(String),
          messagingMessageSentAt: expect.any(Date),
          messagingMessageStatus: "SENT",
        },
      });
    });
  },
);

function getNotificationContext({
  id,
  type,
  content,
  channelId,
  threadId,
  messagingChannelId = "channel-1",
}: {
  id: string;
  type: ActionType;
  content: string | null;
  channelId: string;
  threadId: string;
  messagingChannelId?: string | null;
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
    messagingChannelId,
    messagingMessageStatus: null,
    executedRule: {
      id: `executed-rule-${id}`,
      ruleId: "rule-1",
      messageId: `message-${id}`,
      threadId,
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
      actionItems: [],
    },
    messagingChannel: messagingChannelId
      ? {
          id: messagingChannelId,
          emailAccountId: "email-account-1",
          provider: MessagingProvider.SLACK,
          isConnected: true,
          teamId: "team-1",
          providerUserId: "user-1",
          accessToken: "emulator-token",
          routes: [
            {
              purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
              targetType: MessagingRouteTargetType.CHANNEL,
              targetId: channelId,
            },
          ],
        }
      : null,
  };
}

async function findMessageBySubject({
  channelId,
  subject,
}: {
  channelId: string;
  subject: string;
}) {
  const history = await emulatorClient.conversations.history({
    channel: channelId,
  });

  return history.messages?.find((message) => message.text?.includes(subject));
}

async function updateSlackCardMessage({
  channelId,
  messageId,
  card,
}: {
  channelId: string;
  messageId: string;
  card: unknown;
}) {
  await emulatorClient.chat.update({
    channel: channelId,
    ts: messageId,
    text: cardToFallbackText(card as never),
    blocks: cardToBlockKit(card as never),
  });
}

function getActionLabels(blocks: unknown[] | undefined) {
  if (!blocks) return [];

  return blocks.flatMap((block) => {
    if (
      !block ||
      typeof block !== "object" ||
      !("type" in block) ||
      block.type !== "actions" ||
      !("elements" in block) ||
      !Array.isArray(block.elements)
    ) {
      return [];
    }

    return block.elements.flatMap((element) => {
      if (
        element &&
        typeof element === "object" &&
        "type" in element &&
        element.type === "static_select" &&
        "placeholder" in element &&
        element.placeholder &&
        typeof element.placeholder === "object" &&
        "text" in element.placeholder &&
        typeof element.placeholder.text === "string"
      ) {
        return [element.placeholder.text];
      }

      if (
        !element ||
        typeof element !== "object" ||
        !("text" in element) ||
        !element.text ||
        typeof element.text !== "object" ||
        !("text" in element.text) ||
        typeof element.text.text !== "string"
      ) {
        return [];
      }

      return [element.text.text];
    });
  });
}

function getUniqueSubject(prefix: string) {
  return `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 8)}`;
}
