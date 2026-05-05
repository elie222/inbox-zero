import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { processSlackSlashCommand } from "@/utils/messaging/providers/slack/slash-commands";

const {
  mockAiProcessAssistantChat,
  mockConvertToModelMessages,
  mockGetEmailAccountWithAi,
  mockGetInboxStatsForChatContext,
  mockGetRecentChatMemories,
  mockReadUIMessageStream,
} = vi.hoisted(() => ({
  mockAiProcessAssistantChat: vi.fn(),
  mockConvertToModelMessages: vi.fn(),
  mockGetEmailAccountWithAi: vi.fn(),
  mockGetInboxStatsForChatContext: vi.fn(),
  mockGetRecentChatMemories: vi.fn(),
  mockReadUIMessageStream: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: {
    EMAIL_ENCRYPT_SALT: "test-encrypt-salt",
  },
}));

vi.mock("ai", () => ({
  convertToModelMessages: mockConvertToModelMessages,
  readUIMessageStream: mockReadUIMessageStream,
}));

vi.mock("@/utils/ai/assistant/chat", () => ({
  aiProcessAssistantChat: mockAiProcessAssistantChat,
}));

vi.mock("@/utils/ai/assistant/get-inbox-stats-for-chat-context", () => ({
  getInboxStatsForChatContext: mockGetInboxStatsForChatContext,
}));

vi.mock("@/utils/ai/assistant/get-recent-chat-memories", () => ({
  getRecentChatMemories: mockGetRecentChatMemories,
}));

vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: mockGetEmailAccountWithAi,
}));

const logger = createScopedLogger("slack-slash-command-test");

describe("processSlackSlashCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );

    prisma.messagingChannel.findFirst.mockResolvedValue({
      emailAccountId: "target-email-account",
    } as any);
    prisma.chat.upsert.mockResolvedValue({
      id: "slack-cmd-slack-user-slack-team-target-email-account",
      emailAccountId: "target-email-account",
      lastSeenRulesRevision: null,
      messages: [],
      compactions: [],
    } as any);
    prisma.chatMessage.create.mockResolvedValue({} as any);
    mockGetEmailAccountWithAi.mockResolvedValue({
      account: { provider: "google" },
    });
    mockGetInboxStatsForChatContext.mockResolvedValue({});
    mockGetRecentChatMemories.mockResolvedValue([]);
    mockConvertToModelMessages.mockResolvedValue([]);
    mockAiProcessAssistantChat.mockResolvedValue({
      toUIMessageStream: vi.fn(() => ({})),
    });
    mockReadUIMessageStream.mockImplementation(async function* () {
      yield {
        id: "assistant-message",
        role: "assistant",
        parts: [{ type: "text", text: "Done" }],
      };
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fails closed when the slash-command chat row belongs to another account", async () => {
    prisma.chat.upsert.mockResolvedValueOnce({
      id: "slack-cmd-slack-user-slack-team-target-email-account",
      emailAccountId: "attacker-email-account",
      lastSeenRulesRevision: null,
      messages: [
        {
          id: "seeded-message",
          role: "user",
          parts: [{ type: "text", text: "Use this planted context." }],
        },
      ],
      compactions: [],
    } as any);

    await processSlackSlashCommand({
      command: "/summary",
      userId: "slack-user",
      teamId: "slack-team",
      responseUrl: "https://hooks.slack.com/commands/response",
      logger,
    });

    expect(mockAiProcessAssistantChat).not.toHaveBeenCalled();
    expect(prisma.chatMessage.create).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/commands/response",
      expect.objectContaining({
        body: expect.stringContaining("Something went wrong"),
      }),
    );
  });

  it("does not use public Slack identifiers directly as the chat id", async () => {
    await processSlackSlashCommand({
      command: "/summary",
      userId: "slack-user",
      teamId: "slack-team",
      responseUrl: "https://hooks.slack.com/commands/response",
      logger,
    });

    expect(prisma.chat.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: expect.not.stringMatching(
            /^slack-cmd-slack-user-slack-team-target-email-account$/,
          ),
        },
      }),
    );
  });
});
