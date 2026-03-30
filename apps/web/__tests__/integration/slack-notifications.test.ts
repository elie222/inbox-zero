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
import { createEmulator, type Emulator } from "emulate";
import { WebClient } from "@slack/web-api";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { ActionType, MessagingProvider } from "@/generated/prisma/enums";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/rule/rule-history", () => ({
  createRuleHistory: vi.fn().mockResolvedValue(undefined),
}));

// Mock createSlackClient so production functions use our emulator-bound client
let emulatorClient: WebClient;
vi.mock("@/utils/messaging/providers/slack/client", () => ({
  createSlackClient: () => emulatorClient,
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "true";
const TEST_PORT = 4098;
const logger = createScopedLogger("test");

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Slack notification flows",
  { timeout: 30_000 },
  () => {
    let emulator: Emulator;
    let notifChannelId: string;
    let engChannelId: string;

    beforeAll(async () => {
      emulator = await createEmulator({
        service: "slack",
        port: TEST_PORT,
        seed: {
          slack: {
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
          },
        },
      });

      emulatorClient = new WebClient("emulator-token", {
        slackApiUrl: `${emulator.url}/api/`,
      });

      // Resolve channel IDs once for all tests
      const { listChannels } = await import(
        "@/utils/messaging/providers/slack/channels"
      );
      const channels = await listChannels(emulatorClient);
      notifChannelId = channels.find(
        (c) => c.name === "inbox-zero-notifications",
      )!.id;
      engChannelId = channels.find((c) => c.name === "engineering")!.id;
    });

    afterAll(async () => {
      await emulator?.close();
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
      const { sendSlackRuleNotification } = await import(
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

      await sendSlackRuleNotification({
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
      expect(message?.text).toContain("Draft reply");
      expect(message?.text).toContain(`Subject: ${subject}`);
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

    test("sendSlackRuleNotification posts a generic info card with archive actions", async () => {
      const { sendSlackRuleNotification } = await import(
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

      await sendSlackRuleNotification({
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
      expect(message?.text).toContain("Email notification");
      expect(message?.text).toContain(`Subject: ${subject}`);
      expect(getActionLabels(postArgs?.blocks)).toEqual(
        expect.arrayContaining(["Archive", "Mark read"]),
      );
    });

    test("sendSlackRuleNotification replies in a thread for later actions on the same email thread", async () => {
      const { sendSlackRuleNotification } = await import(
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

      await sendSlackRuleNotification({
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

      await sendSlackRuleNotification({
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
        userEmail: "user@example.com",
        userId: "user-1",
        emailAccountId,
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
      expect(message?.text).toContain("Draft reply");
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
    },
    messagingChannel: messagingChannelId
      ? {
          id: messagingChannelId,
          provider: MessagingProvider.SLACK,
          isConnected: true,
          teamId: "team-1",
          providerUserId: null,
          accessToken: "emulator-token",
          channelId,
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

  return history.messages?.find((message) =>
    message.text?.includes(`Subject: ${subject}`),
  );
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
