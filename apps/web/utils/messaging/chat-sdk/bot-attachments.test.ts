import { createUIMessageStream } from "ai";
import { Chat, type Message, type Thread } from "chat";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessagingRouteTargetType } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import { getMessagingChatSdkBot } from "@/utils/messaging/chat-sdk/bot";
import { getEmailAccountWithAi } from "@/utils/user/get";

const { slackAdapter } = vi.hoisted(() => ({
  slackAdapter: {
    name: "slack",
    decodeThreadId: vi.fn(() => ({ channel: "C-TEST", threadTs: "123.456" })),
    addReaction: vi.fn().mockResolvedValue(undefined),
    removeReaction: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({ env: { REDIS_URL: undefined } }));
vi.mock("@/utils/messaging/chat-sdk/adapters", () => ({
  getMessagingAdapterRegistry: () => ({
    adapters: { slack: slackAdapter },
    typedAdapters: { slack: slackAdapter },
  }),
}));
vi.mock("@/utils/ai/assistant/chat", () => ({
  aiProcessAssistantChat: vi.fn(),
}));
vi.mock("@/utils/user/get", () => ({ getEmailAccountWithAi: vi.fn() }));
vi.mock("@/utils/ai/assistant/get-inbox-stats-for-chat-context", () => ({
  getInboxStatsForChatContext: vi.fn().mockResolvedValue({}),
}));
vi.mock("@/utils/ai/assistant/get-recent-chat-memories", () => ({
  getRecentChatMemories: vi.fn().mockResolvedValue([]),
}));

describe("messaging attachment handling", () => {
  let onMention: Parameters<Chat["onNewMention"]>[0];
  let onSubscribedMessage: Parameters<Chat["onSubscribedMessage"]>[0];

  beforeEach(() => {
    vi.clearAllMocks();
    global.inboxZeroMessagingChatSdk = undefined;
    const mentionSpy = vi.spyOn(Chat.prototype, "onNewMention");
    const subscribedSpy = vi.spyOn(Chat.prototype, "onSubscribedMessage");
    getMessagingChatSdkBot();
    onMention = mentionSpy.mock.calls[0][0];
    onSubscribedMessage = subscribedSpy.mock.calls[0][0];

    prisma.messagingChannel.findMany.mockResolvedValue([
      {
        id: "messaging-channel-test",
        accessToken: "test-token",
        botUserId: "UBOT123",
        emailAccountId: "email-account-test",
        routes: [
          {
            targetId: "C-TEST",
            targetType: MessagingRouteTargetType.CHANNEL,
          },
        ],
      },
    ] as never);
    prisma.chat.upsert.mockResolvedValue({
      id: "chat-test",
      lastSeenRulesRevision: null,
      messages: [],
      compactions: [],
    } as never);
    prisma.chatMessage.findUnique.mockResolvedValue(null);
    prisma.chatMessage.upsert.mockResolvedValue({} as never);
    prisma.chatMessage.create.mockResolvedValue({} as never);
    vi.mocked(getEmailAccountWithAi).mockResolvedValue({
      email: "user@example.com",
      account: { provider: "google" },
    } as never);
    vi.mocked(aiProcessAssistantChat).mockResolvedValue({
      toUIMessageStream: () =>
        createUIMessageStream({
          execute: ({ writer }) => {
            writer.write({ type: "text-start", id: "assistant-text" });
            writer.write({
              type: "text-delta",
              id: "assistant-text",
              delta: "Test assistant response.",
            });
            writer.write({ type: "text-end", id: "assistant-text" });
          },
        }),
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    global.inboxZeroMessagingChatSdk = undefined;
  });

  it.each([
    ["mention only", "<@UBOT123>"],
    ["email request", "<@UBOT123> Email this file to recipient@example.com"],
  ])("stops after the unsupported file notice in a Slack channel: %s", async (_, text) => {
    const { thread, message, post } = createMessagingInput({ text });

    await onMention(thread, message);

    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({
        raw: expect.stringContaining("can't access or email"),
      }),
    );
    expect(aiProcessAssistantChat).not.toHaveBeenCalled();
    expect(getEmailAccountWithAi).not.toHaveBeenCalled();
    expect(prisma.chat.upsert).not.toHaveBeenCalled();
    expect(thread.subscribe).toHaveBeenCalledOnce();
    expect(slackAdapter.removeReaction).toHaveBeenCalledOnce();
  });

  it("stops unsupported files in subscribed Slack channel threads", async () => {
    const { thread, message, post } = createMessagingInput({
      text: "Email this file to recipient@example.com",
      rawType: "message",
    });

    await onSubscribedMessage(thread, message);

    expect(post).toHaveBeenCalledOnce();
    expect(aiProcessAssistantChat).not.toHaveBeenCalled();
    expect(prisma.chat.upsert).not.toHaveBeenCalled();
  });

  it("does not draft when posting the unsupported file notice fails", async () => {
    const { thread, message, post } = createMessagingInput({});
    post.mockRejectedValueOnce(new Error("Test posting failure"));

    await onMention(thread, message);

    expect(aiProcessAssistantChat).not.toHaveBeenCalled();
    expect(slackAdapter.removeReaction).toHaveBeenCalledOnce();
  });

  it("stops a Slack channel message containing both an image and an unsupported file", async () => {
    const { thread, message, post } = createMessagingInput({});
    message.attachments = [
      { type: "image", mimeType: "image/png", data: Buffer.from("test-image") },
    ];

    await onMention(thread, message);

    expect(post).toHaveBeenCalledOnce();
    expect(aiProcessAssistantChat).not.toHaveBeenCalled();
  });

  it.each([
    "slack",
    "telegram",
  ] as const)("preserves %s DM handling for unsupported files with text", async (provider) => {
    const { thread, message, post } = createMessagingInput({
      provider,
      isDM: true,
    });

    await onSubscribedMessage(thread, message);

    expect(aiProcessAssistantChat).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledTimes(2);
    expect(prisma.chatMessage.create).toHaveBeenCalledOnce();
  });

  it.each([
    "slack",
    "telegram",
  ] as const)("preserves %s DM handling for unsupported files without text", async (provider) => {
    const { thread, message, post } = createMessagingInput({
      provider,
      isDM: true,
      text: "",
    });

    await onSubscribedMessage(thread, message);

    expect(post).toHaveBeenCalledOnce();
    expect(aiProcessAssistantChat).not.toHaveBeenCalled();
  });

  it.each([
    ["text only", false],
    ["supported image", true],
  ] as const)("still processes Slack channel messages: %s", async (_, hasImage) => {
    const { thread, message, post } = createMessagingInput({});
    message.raw = { type: "app_mention", team_id: "T-TEST" };
    message.attachments = hasImage
      ? [
          {
            type: "image",
            mimeType: "image/png",
            data: Buffer.from("test-image"),
          },
        ]
      : [];

    await onMention(thread, message);

    expect(aiProcessAssistantChat).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledOnce();
  });
});

function createMessagingInput({
  provider = "slack",
  isDM = false,
  text = "Email this file to recipient@example.com",
  rawType = "app_mention",
}: {
  provider?: "slack" | "telegram";
  isDM?: boolean;
  text?: string;
  rawType?: string;
}) {
  const post = vi.fn().mockResolvedValue({ id: "posted-message" });
  const thread = {
    id: `${provider}:C-TEST:123.456`,
    adapter: { name: provider },
    isDM,
    post,
    subscribe: vi.fn().mockResolvedValue(undefined),
    startTyping: vi.fn().mockResolvedValue(undefined),
  } as unknown as Thread;
  const message = {
    id: "message-test",
    text,
    author: { userId: "U-TEST", isMe: false },
    attachments: [],
    raw:
      provider === "slack"
        ? {
            type: rawType,
            team_id: "T-TEST",
            files: [{ id: "F-TEST", mimetype: "application/pdf" }],
          }
        : { chat: { id: 123 }, document: { file_id: "file-test" } },
  } as unknown as Message;
  return { thread, message, post };
}
