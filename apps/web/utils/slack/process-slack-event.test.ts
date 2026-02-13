import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

const mockPostMessage = vi.fn().mockResolvedValue({});
const mockReactionsAdd = vi.fn().mockResolvedValue({});
const mockReactionsRemove = vi.fn().mockResolvedValue({});
type MockClient = {
  reactions: {
    add: typeof mockReactionsAdd;
    remove: typeof mockReactionsRemove;
  };
};
vi.mock("@inboxzero/slack", () => ({
  createSlackClient: vi.fn(() => ({
    chat: { postMessage: mockPostMessage },
    reactions: { add: mockReactionsAdd, remove: mockReactionsRemove },
  })),
  markdownToSlackMrkdwn: vi.fn((text: string) => text),
  addReaction: vi.fn(
    async (
      client: MockClient,
      channel: string,
      timestamp: string,
      name: string,
    ) => {
      await client.reactions.add({ channel, timestamp, name });
    },
  ),
  removeReaction: vi.fn(
    async (
      client: MockClient,
      channel: string,
      timestamp: string,
      name: string,
    ) => {
      await client.reactions.remove({ channel, timestamp, name });
    },
  ),
}));

vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: vi.fn().mockResolvedValue({
    id: "email-1",
    email: "user@test.com",
  }),
}));

vi.mock("@/utils/ai/assistant/chat", () => ({
  aiProcessAssistantChat: vi.fn().mockResolvedValue({
    text: Promise.resolve("AI response"),
  }),
}));

vi.mock("ai", () => ({
  convertToModelMessages: vi.fn((msgs: unknown[]) => msgs),
}));

import { processSlackEvent } from "./process-slack-event";

const logger = createScopedLogger("test-slack");

function makePayload(overrides: {
  type?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  team_id?: string;
}) {
  return {
    team_id: overrides.team_id ?? "T-TEAM",
    event: {
      type: overrides.type ?? "message",
      user: overrides.user ?? "U-AUTH-USER",
      bot_id: overrides.bot_id,
      text: overrides.text ?? "hello",
      channel: overrides.channel ?? "D-DM-CHANNEL",
      channel_type: overrides.channel_type ?? "im",
      ts: overrides.ts ?? "1234567890.000001",
      thread_ts: overrides.thread_ts,
    },
  };
}

const CANDIDATE_1 = {
  id: "mc-1",
  accessToken: "xoxb-token-1",
  botUserId: "U-BOT",
  emailAccountId: "email-1",
  channelId: "C-PRIVATE-1",
};

const CANDIDATE_2 = {
  id: "mc-2",
  accessToken: "xoxb-token-2",
  botUserId: "U-BOT",
  emailAccountId: "email-2",
  channelId: "C-PRIVATE-2",
};

describe("processSlackEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("event filtering", () => {
    it("ignores bot messages", async () => {
      await processSlackEvent(
        makePayload({ bot_id: "B-BOT", user: undefined }),
        logger,
      );

      expect(prisma.messagingChannel.findMany).not.toHaveBeenCalled();
    });

    it("ignores non-DM messages (channel messages without @mention)", async () => {
      await processSlackEvent(
        makePayload({ type: "message", channel_type: "channel" }),
        logger,
      );

      expect(prisma.messagingChannel.findMany).not.toHaveBeenCalled();
    });

    it("ignores unsupported event types", async () => {
      await processSlackEvent(makePayload({ type: "reaction_added" }), logger);

      expect(prisma.messagingChannel.findMany).not.toHaveBeenCalled();
    });
  });

  describe("authorization", () => {
    it("filters candidates by providerUserId matching event user", async () => {
      prisma.messagingChannel.findMany.mockResolvedValue([]);
      prisma.messagingChannel.findFirst.mockResolvedValue(null);

      await processSlackEvent(makePayload({ user: "U-AUTH-USER" }), logger);

      expect(prisma.messagingChannel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            providerUserId: "U-AUTH-USER",
          }),
        }),
      );
    });

    it("sends guidance message for unauthorized users", async () => {
      prisma.messagingChannel.findMany.mockResolvedValue([]);
      prisma.messagingChannel.findFirst.mockResolvedValue({
        accessToken: "xoxb-any-token",
      } as any);

      await processSlackEvent(makePayload({ user: "U-UNAUTHORIZED" }), logger);

      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("connect your Inbox Zero account"),
        }),
      );
    });

    it("does not process AI chat for unauthorized users", async () => {
      const { aiProcessAssistantChat } = await import(
        "@/utils/ai/assistant/chat"
      );
      prisma.messagingChannel.findMany.mockResolvedValue([]);
      prisma.messagingChannel.findFirst.mockResolvedValue(null);

      await processSlackEvent(makePayload({ user: "U-UNAUTHORIZED" }), logger);

      expect(aiProcessAssistantChat).not.toHaveBeenCalled();
    });
  });

  describe("DM routing", () => {
    it("processes DM from authorized user with single account", async () => {
      const { aiProcessAssistantChat } = await import(
        "@/utils/ai/assistant/chat"
      );
      prisma.messagingChannel.findMany.mockResolvedValue([CANDIDATE_1]);
      prisma.chat.upsert.mockResolvedValue({
        id: "slack-D-DM-CHANNEL",
        messages: [],
        emailAccountId: "email-1",
      } as any);
      prisma.chatMessage.upsert.mockResolvedValue({} as any);
      prisma.chatMessage.create.mockResolvedValue({} as any);

      await processSlackEvent(makePayload({}), logger);

      expect(aiProcessAssistantChat).toHaveBeenCalled();
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: "D-DM-CHANNEL",
          text: "AI response",
          mrkdwn: true,
        }),
      );
    });

    it("uses existing chat thread to route multi-account DMs", async () => {
      const { aiProcessAssistantChat } = await import(
        "@/utils/ai/assistant/chat"
      );
      prisma.messagingChannel.findMany.mockResolvedValue([
        CANDIDATE_1,
        CANDIDATE_2,
      ]);
      prisma.chat.findUnique.mockResolvedValue({
        emailAccountId: "email-2",
      } as any);
      prisma.chat.upsert.mockResolvedValue({
        id: "slack-D-DM-CHANNEL",
        messages: [],
        emailAccountId: "email-2",
      } as any);
      prisma.chatMessage.upsert.mockResolvedValue({} as any);
      prisma.chatMessage.create.mockResolvedValue({} as any);

      await processSlackEvent(makePayload({}), logger);

      expect(aiProcessAssistantChat).toHaveBeenCalledWith(
        expect.objectContaining({ emailAccountId: "email-2" }),
      );
    });

    it("defaults to first candidate for multi-account DMs with no existing chat", async () => {
      const { aiProcessAssistantChat } = await import(
        "@/utils/ai/assistant/chat"
      );
      prisma.messagingChannel.findMany.mockResolvedValue([
        CANDIDATE_1,
        CANDIDATE_2,
      ]);
      prisma.chat.findUnique.mockResolvedValue(null);
      prisma.chat.upsert.mockResolvedValue({
        id: "slack-D-DM-CHANNEL",
        messages: [],
        emailAccountId: "email-1",
      } as any);
      prisma.chatMessage.upsert.mockResolvedValue({} as any);
      prisma.chatMessage.create.mockResolvedValue({} as any);

      await processSlackEvent(makePayload({}), logger);

      expect(aiProcessAssistantChat).toHaveBeenCalledWith(
        expect.objectContaining({ emailAccountId: "email-1" }),
      );
    });
  });

  describe("app_mention routing", () => {
    it("routes to correct account when channel matches", async () => {
      const { aiProcessAssistantChat } = await import(
        "@/utils/ai/assistant/chat"
      );
      prisma.messagingChannel.findMany.mockResolvedValue([
        CANDIDATE_1,
        CANDIDATE_2,
      ]);
      prisma.chat.upsert.mockResolvedValue({
        id: "slack-C-PRIVATE-2",
        messages: [],
        emailAccountId: "email-2",
      } as any);
      prisma.chatMessage.upsert.mockResolvedValue({} as any);
      prisma.chatMessage.create.mockResolvedValue({} as any);

      await processSlackEvent(
        makePayload({
          type: "app_mention",
          channel: "C-PRIVATE-2",
          channel_type: "channel",
          text: "<@U-BOT> check my emails",
        }),
        logger,
      );

      expect(aiProcessAssistantChat).toHaveBeenCalledWith(
        expect.objectContaining({ emailAccountId: "email-2" }),
      );
    });

    it("rejects app_mention in unlinked channel even with single candidate", async () => {
      const { aiProcessAssistantChat } = await import(
        "@/utils/ai/assistant/chat"
      );
      prisma.messagingChannel.findMany.mockResolvedValue([CANDIDATE_1]);

      await processSlackEvent(
        makePayload({
          type: "app_mention",
          channel: "C-RANDOM-CHANNEL",
          channel_type: "channel",
          text: "<@U-BOT> check my emails",
        }),
        logger,
      );

      expect(aiProcessAssistantChat).not.toHaveBeenCalled();
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("isn't linked to an email account"),
        }),
      );
    });

    it("rejects app_mention in unlinked channel with multiple candidates", async () => {
      const { aiProcessAssistantChat } = await import(
        "@/utils/ai/assistant/chat"
      );
      prisma.messagingChannel.findMany.mockResolvedValue([
        CANDIDATE_1,
        CANDIDATE_2,
      ]);

      await processSlackEvent(
        makePayload({
          type: "app_mention",
          channel: "C-RANDOM-CHANNEL",
          channel_type: "channel",
          text: "<@U-BOT> check my emails",
        }),
        logger,
      );

      expect(aiProcessAssistantChat).not.toHaveBeenCalled();
    });
  });

  describe("bot mention stripping", () => {
    it("strips bot mention from app_mention text", async () => {
      const { aiProcessAssistantChat } = await import(
        "@/utils/ai/assistant/chat"
      );
      prisma.messagingChannel.findMany.mockResolvedValue([CANDIDATE_1]);
      prisma.chat.upsert.mockResolvedValue({
        id: "slack-C-PRIVATE-1",
        messages: [],
        emailAccountId: "email-1",
      } as any);
      prisma.chatMessage.upsert.mockResolvedValue({} as any);
      prisma.chatMessage.create.mockResolvedValue({} as any);

      await processSlackEvent(
        makePayload({
          type: "app_mention",
          channel: "C-PRIVATE-1",
          channel_type: "channel",
          text: "<@U-BOT> check my emails",
        }),
        logger,
      );

      expect(prisma.chatMessage.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            parts: [{ type: "text", text: "check my emails" }],
          }),
        }),
      );
    });

    it("skips processing when text is only a bot mention", async () => {
      const { aiProcessAssistantChat } = await import(
        "@/utils/ai/assistant/chat"
      );
      prisma.messagingChannel.findMany.mockResolvedValue([CANDIDATE_1]);

      await processSlackEvent(
        makePayload({
          type: "app_mention",
          channel: "C-PRIVATE-1",
          channel_type: "channel",
          text: "<@U-BOT>",
        }),
        logger,
      );

      expect(aiProcessAssistantChat).not.toHaveBeenCalled();
    });
  });

  describe("processing reaction indicator", () => {
    it("adds eyes reaction before processing and removes after response", async () => {
      prisma.messagingChannel.findMany.mockResolvedValue([CANDIDATE_1]);
      prisma.chat.upsert.mockResolvedValue({
        id: "slack-D-DM-CHANNEL",
        messages: [],
        emailAccountId: "email-1",
      } as any);
      prisma.chatMessage.upsert.mockResolvedValue({} as any);
      prisma.chatMessage.create.mockResolvedValue({} as any);

      await processSlackEvent(makePayload({}), logger);

      expect(mockReactionsAdd).toHaveBeenCalledWith({
        channel: "D-DM-CHANNEL",
        timestamp: "1234567890.000001",
        name: "eyes",
      });
      expect(mockReactionsRemove).toHaveBeenCalledWith({
        channel: "D-DM-CHANNEL",
        timestamp: "1234567890.000001",
        name: "eyes",
      });
    });

    it("removes eyes reaction on AI processing error", async () => {
      const { aiProcessAssistantChat } = await import(
        "@/utils/ai/assistant/chat"
      );
      vi.mocked(aiProcessAssistantChat).mockRejectedValueOnce(
        new Error("AI failed"),
      );
      prisma.messagingChannel.findMany.mockResolvedValue([CANDIDATE_1]);
      prisma.chat.upsert.mockResolvedValue({
        id: "slack-D-DM-CHANNEL",
        messages: [],
        emailAccountId: "email-1",
      } as any);
      prisma.chatMessage.upsert.mockResolvedValue({} as any);

      await processSlackEvent(makePayload({}), logger);

      expect(mockReactionsAdd).toHaveBeenCalled();
      expect(mockReactionsRemove).toHaveBeenCalledWith({
        channel: "D-DM-CHANNEL",
        timestamp: "1234567890.000001",
        name: "eyes",
      });
    });
  });
});
