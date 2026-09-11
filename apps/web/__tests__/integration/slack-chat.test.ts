import { createUIMessageStream } from "ai";
import { WebClient } from "@slack/web-api";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  createSignedSlackRequest,
  createSlackTestHarness,
  type SlackTestHarness,
} from "./helpers";

vi.mock("@/utils/prisma");

const aiProcessAssistantChatMock = vi.fn();
const getEmailAccountWithAiMock = vi.fn();
const getInboxStatsForChatContextMock = vi.fn();
const getRecentChatMemoriesMock = vi.fn();

vi.mock("@/env", () => ({
  env: {
    EMAIL_ENCRYPT_SALT: "test-email-encrypt-salt",
    EMAIL_ENCRYPT_SECRET: "test-email-encrypt-secret",
    REDIS_URL: undefined,
    SLACK_SIGNING_SECRET: "test-signing-secret",
  },
}));

vi.mock("@/utils/ai/assistant/chat", () => ({
  aiProcessAssistantChat: (...args: unknown[]) =>
    aiProcessAssistantChatMock(...args),
}));

vi.mock("@/utils/ai/assistant/get-inbox-stats-for-chat-context", () => ({
  getInboxStatsForChatContext: (...args: unknown[]) =>
    getInboxStatsForChatContextMock(...args),
}));

vi.mock("@/utils/ai/assistant/get-recent-chat-memories", () => ({
  getRecentChatMemories: (...args: unknown[]) =>
    getRecentChatMemoriesMock(...args),
}));

vi.mock("@/utils/ai/assistant/chat-seen-rules-revision", () => ({
  mergeSeenRulesRevision: vi.fn((current: number | null, next: number) =>
    current == null ? next : Math.max(current, next),
  ),
  saveLastSeenRulesRevision: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: (...args: unknown[]) =>
    getEmailAccountWithAiMock(...args),
}));

vi.mock("@/utils/messaging/rule-notifications", () => ({
  handleRuleNotificationAction: vi.fn(),
  handleSlackRuleNotificationModalSubmit: vi.fn(),
  SLACK_DRAFT_EDIT_MODAL_ID: "slack-draft-edit-modal",
  RULE_NOTIFICATION_ACTION_IDS: [],
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "true";
const TEST_PORT = 4118;
const logger = createTestLogger();

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Slack chat webhook",
  { timeout: 30_000 },
  () => {
    let slackHarness: SlackTestHarness;
    let emulatorClient: WebClient;
    let teamId: string;
    let userId: string;
    let channelId: string;
    let fetchSpy: ReturnType<typeof vi.spyOn<typeof globalThis, "fetch">>;
    let slackApiCallSpy: ReturnType<typeof vi.spyOn>;
    let originalSlackApiUrl: string | undefined;

    beforeAll(async () => {
      originalSlackApiUrl = process.env.SLACK_API_URL;

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
            name: "assistant-chat",
            is_private: false,
            topic: "Assistant chat tests",
          },
        ],
      });

      process.env.SLACK_API_URL = `${slackHarness.emulator.url}/api/`;
      emulatorClient = slackHarness.client;

      teamId = slackHarness.teamId;
      userId = slackHarness.usersByName.alice;
      channelId = slackHarness.channelsByName["assistant-chat"];
      if (!userId) throw new Error("Slack emulator user not found");
      if (!channelId) {
        throw new Error("Slack emulator channel not found");
      }
    });

    afterAll(async () => {
      fetchSpy?.mockRestore();
      slackApiCallSpy?.mockRestore();
      if (originalSlackApiUrl === undefined) {
        delete process.env.SLACK_API_URL;
      } else {
        process.env.SLACK_API_URL = originalSlackApiUrl;
      }
      await slackHarness?.emulator.close();
    });

    beforeEach(async () => {
      vi.clearAllMocks();

      (
        globalThis as typeof globalThis & {
          inboxZeroMessagingAdapterRegistry?: unknown;
          inboxZeroMessagingChatSdk?: unknown;
        }
      ).inboxZeroMessagingAdapterRegistry = undefined;
      (
        globalThis as typeof globalThis & {
          inboxZeroMessagingAdapterRegistry?: unknown;
          inboxZeroMessagingChatSdk?: unknown;
        }
      ).inboxZeroMessagingChatSdk = undefined;

      fetchSpy?.mockRestore();
      slackApiCallSpy?.mockRestore();
      const originalSlackApiCall = WebClient.prototype.apiCall;
      slackApiCallSpy = vi
        .spyOn(WebClient.prototype, "apiCall")
        .mockImplementation(function (
          this: WebClient,
          method: string,
          options?: Parameters<WebClient["apiCall"]>[1],
        ) {
          const response = mockUnsupportedSlackApiCall({
            channelId,
            method,
            options,
            userId,
          });

          if (response) return Promise.resolve(response);

          return originalSlackApiCall.call(this, method, options);
        });

      const originalFetch = globalThis.fetch.bind(globalThis);
      fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation((input, init) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;

          if (url.startsWith("https://slack.com/api/")) {
            const rewrittenUrl = url.replace(
              "https://slack.com/api/",
              `${slackHarness.emulator.url}/api/`,
            );

            if (input instanceof Request) {
              return originalFetch(new Request(rewrittenUrl, input));
            }

            return originalFetch(rewrittenUrl, init);
          }

          return originalFetch(input, init);
        });

      prisma.messagingChannel.findFirst.mockResolvedValue({
        accessToken: "emulator-token",
        botUserId: "UAPP123",
        teamName: "TestWorkspace",
      } as never);
      prisma.messagingChannel.findMany.mockResolvedValue([
        {
          id: "messaging-channel-1",
          accessToken: "emulator-token",
          botUserId: "UAPP123",
          emailAccountId: "email-account-1",
          routes: [
            {
              purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
              targetId: channelId,
              targetType: MessagingRouteTargetType.CHANNEL,
            },
          ],
        },
      ] as never);
      prisma.chat.upsert.mockImplementation(
        async ({ where }) =>
          ({
            id: where.id,
            lastSeenRulesRevision: null,
            messages: [],
            compactions: [],
          }) as never,
      );
      prisma.chatMessage.upsert.mockResolvedValue({} as never);
      prisma.chatMessage.findUnique.mockResolvedValue(null);
      prisma.chatMessage.create.mockResolvedValue({} as never);

      getEmailAccountWithAiMock.mockResolvedValue({
        email: "user@example.com",
        account: { provider: "google" },
      });
      getInboxStatsForChatContextMock.mockResolvedValue({});
      getRecentChatMemoriesMock.mockResolvedValue([]);
      aiProcessAssistantChatMock.mockImplementation(async () => ({
        toUIMessageStream: ({
          originalMessages,
          generateMessageId,
        }: {
          originalMessages: unknown[];
          generateMessageId: () => string;
        }) =>
          createUIMessageStream({
            originalMessages,
            generateId: generateMessageId,
            execute: ({ writer }) => {
              writer.write({ type: "text-start", id: "assistant-text" });
              writer.write({
                type: "text-delta",
                id: "assistant-text",
                delta: "Handled affirmative reply.",
              });
              writer.write({ type: "text-end", id: "assistant-text" });
            },
          }),
      }));
    });

    test("passes an emoji-only Slack mention through unchanged", async () => {
      const { ensureSlackTeamInstallation, getMessagingChatSdkBot } =
        await import("@/utils/messaging/chat-sdk/bot");

      await ensureSlackTeamInstallation(teamId, logger);

      const parent = await emulatorClient.chat.postMessage({
        channel: channelId,
        text: "Parent message",
      });
      const ts = parent.ts!;

      const body = JSON.stringify({
        type: "event_callback",
        team_id: teamId,
        api_app_id: "AAPP123",
        event_id: "Ev123",
        event_time: Math.floor(Date.now() / 1000),
        authorizations: [
          {
            team_id: teamId,
            user_id: "UAPP123",
            is_bot: false,
            is_enterprise_install: false,
          },
        ],
        event: {
          type: "app_mention",
          user: userId,
          text: "<@UAPP123> 👍",
          ts,
          channel: channelId,
          channel_type: "channel",
          event_ts: ts,
        },
      });

      const { bot } = getMessagingChatSdkBot();
      const backgroundTasks: Promise<unknown>[] = [];
      const response = await bot.webhooks.slack(
        createSignedSlackRequest({ body }),
        {
          waitUntil: (promise) => {
            backgroundTasks.push(promise);
          },
        },
      );

      expect(response.status).toBe(200);
      await vi.waitFor(() => {
        expect(backgroundTasks.length).toBeGreaterThan(0);
      });
      await Promise.all(backgroundTasks);
      expect(aiProcessAssistantChatMock).toHaveBeenCalledTimes(1);

      const modelMessages = aiProcessAssistantChatMock.mock.calls[0]?.[0]
        ?.messages as Array<unknown>;
      expect(JSON.stringify(modelMessages.at(-1))).toContain('"text":"👍"');
      expect(JSON.stringify(modelMessages.at(-1))).not.toContain(
        '"text":"yes"',
      );
    });

    test("treats an affirmative Slack reaction as yes", async () => {
      const { ensureSlackTeamInstallation, getMessagingChatSdkBot } =
        await import("@/utils/messaging/chat-sdk/bot");

      await ensureSlackTeamInstallation(teamId, logger);

      const parent = await emulatorClient.chat.postMessage({
        channel: channelId,
        text: "Parent message",
      });
      const ts = parent.ts!;

      const body = JSON.stringify({
        type: "event_callback",
        team_id: teamId,
        api_app_id: "AAPP123",
        event_id: "Ev124",
        event_time: Math.floor(Date.now() / 1000),
        authorizations: [
          {
            team_id: teamId,
            user_id: "UAPP123",
            is_bot: false,
            is_enterprise_install: false,
          },
        ],
        event: {
          type: "reaction_added",
          user: userId,
          reaction: "+1",
          item_user: "UAPP123",
          item: {
            type: "message",
            channel: channelId,
            ts,
          },
          event_ts: `${Date.now() / 1000}`,
        },
      });

      const { bot } = getMessagingChatSdkBot();
      const backgroundTasks: Promise<unknown>[] = [];
      const response = await bot.webhooks.slack(
        createSignedSlackRequest({ body }),
        {
          waitUntil: (promise) => {
            backgroundTasks.push(promise);
          },
        },
      );

      expect(response.status).toBe(200);
      await vi.waitFor(() => {
        expect(backgroundTasks.length).toBeGreaterThan(0);
      });
      await Promise.all(backgroundTasks);
      expect(aiProcessAssistantChatMock).toHaveBeenCalledTimes(1);

      const modelMessages = aiProcessAssistantChatMock.mock.calls[0]?.[0]
        ?.messages as Array<unknown>;
      expect(JSON.stringify(modelMessages.at(-1))).toContain('"text":"yes"');
    });
  },
);

function mockUnsupportedSlackApiCall({
  channelId,
  method,
  options,
  userId,
}: {
  channelId: string;
  method: string;
  options?: Parameters<WebClient["apiCall"]>[1];
  userId: string;
}) {
  switch (method) {
    case "assistant.threads.setStatus":
    case "chat.appendStream":
    case "chat.startStream":
    case "chat.stopStream":
    case "reactions.add":
    case "reactions.remove":
      return { ok: true, ts: getSlackApiCallValue(options, "ts") };
    case "conversations.info":
      return {
        ok: true,
        channel: {
          id: channelId,
          name: "assistant-chat",
          is_private: false,
          is_ext_shared: false,
        },
      };
    case "conversations.replies": {
      const ts = getSlackApiCallValue(options, "ts");
      return {
        ok: true,
        messages: [
          {
            type: "message",
            user: "UAPP123",
            channel: channelId,
            text: "Parent message",
            ts,
            thread_ts: ts,
          },
        ],
      };
    }
    case "users.info":
      return {
        ok: true,
        user: {
          id: userId,
          name: "alice",
          real_name: "Alice Smith",
          profile: {
            display_name: "Alice Smith",
            real_name: "Alice Smith",
            email: "alice@example.com",
          },
        },
      };
    default:
      return null;
  }
}

function getSlackApiCallValue(
  options: Parameters<WebClient["apiCall"]>[1] | undefined,
  key: string,
) {
  return typeof options === "object" && options && key in options
    ? String(options[key as keyof typeof options])
    : undefined;
}
