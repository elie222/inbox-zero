import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";

const {
  mockAiProcessAssistantChat,
  mockGetEmailAccountWithAi,
  mockGetInboxStatsForChatContext,
  mockConvertToModelMessages,
  mockConvertToUIMessages,
  mockShouldCompact,
  mockCompactMessages,
  mockExtractMemories,
  mockBuildInlineEmailActionSystemMessage,
  mockGetToolFailureWarning,
  mockCreateUIMessageStream,
  mockCreateUIMessageStreamResponse,
  streamState,
} = vi.hoisted(() => ({
  mockAiProcessAssistantChat: vi.fn(),
  mockGetEmailAccountWithAi: vi.fn(),
  mockGetInboxStatsForChatContext: vi.fn(),
  mockConvertToModelMessages: vi.fn(),
  mockConvertToUIMessages: vi.fn(),
  mockShouldCompact: vi.fn(),
  mockCompactMessages: vi.fn(),
  mockExtractMemories: vi.fn(),
  mockBuildInlineEmailActionSystemMessage: vi.fn(),
  mockGetToolFailureWarning: vi.fn(),
  mockCreateUIMessageStream: vi.fn(),
  mockCreateUIMessageStreamResponse: vi.fn(),
  streamState: {
    finishMessages: [] as Array<{
      id: string;
      role: "assistant";
      parts: Array<{ type: "text"; text: string }>;
    }>,
  },
}));

vi.mock("ai", () => ({
  convertToModelMessages: mockConvertToModelMessages,
  createUIMessageStream: mockCreateUIMessageStream,
  createUIMessageStreamResponse: mockCreateUIMessageStreamResponse,
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware({
    auth: {
      userId: "user-1",
      emailAccountId: "email-account-id",
      email: "user@test.com",
    },
  });
});

vi.mock("@/utils/prisma");

vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAi: mockGetEmailAccountWithAi,
}));

vi.mock("@/utils/ai/assistant/chat", () => ({
  aiProcessAssistantChat: mockAiProcessAssistantChat,
}));

vi.mock("@/components/assistant-chat/helpers", () => ({
  convertToUIMessages: mockConvertToUIMessages,
}));

vi.mock("@/utils/ai/assistant/compact", () => ({
  shouldCompact: mockShouldCompact,
  compactMessages: mockCompactMessages,
  extractMemories: mockExtractMemories,
  RECENT_MESSAGES_TO_KEEP: 20,
}));

vi.mock("@/utils/ai/assistant/get-inbox-stats-for-chat-context", () => ({
  getInboxStatsForChatContext: mockGetInboxStatsForChatContext,
}));

vi.mock("@/utils/ai/assistant/inline-email-actions", async (importActual) => {
  const actual =
    await importActual<
      typeof import("@/utils/ai/assistant/inline-email-actions")
    >();

  return {
    ...actual,
    buildInlineEmailActionSystemMessage:
      mockBuildInlineEmailActionSystemMessage,
  };
});

vi.mock("@/utils/ai/assistant/chat-response-guard", () => ({
  getToolFailureWarning: mockGetToolFailureWarning,
}));

import { POST } from "./route";

describe("chat route rule freshness persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    streamState.finishMessages = [
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Done" }],
      },
    ];

    mockGetEmailAccountWithAi.mockResolvedValue(getEmailAccount());
    mockGetInboxStatsForChatContext.mockResolvedValue(null);
    mockConvertToUIMessages.mockReturnValue([]);
    mockConvertToModelMessages.mockResolvedValue([
      { role: "user", content: "Update my rules" },
    ]);
    mockShouldCompact.mockReturnValue(false);
    mockCompactMessages.mockResolvedValue({
      compactedMessages: [],
      summary: "",
      compactedCount: 0,
    });
    mockExtractMemories.mockResolvedValue([]);
    mockBuildInlineEmailActionSystemMessage.mockReturnValue(null);
    mockGetToolFailureWarning.mockReturnValue(null);
    mockCreateUIMessageStream.mockImplementation((options) => options);
    mockCreateUIMessageStreamResponse.mockImplementation(async ({ stream }) => {
      const writer = { write: vi.fn() };
      await stream.execute({ writer });
      await stream.onFinish({ messages: streamState.finishMessages });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    prisma.chat.findUnique.mockResolvedValue({
      id: "chat-1",
      emailAccountId: "email-account-id",
      lastSeenRulesRevision: 2,
      messages: [],
      compactions: [],
    });
    prisma.chat.create.mockResolvedValue(null);
    prisma.chatCompaction.create.mockResolvedValue({
      id: "compaction-1",
    } as any);
    prisma.chatMessage.create.mockResolvedValue({ id: "message-1" });
    prisma.chatMessage.createMany.mockResolvedValue({ count: 1 });
    prisma.chat.update.mockResolvedValue({ id: "chat-1" } as any);
    prisma.chat.updateMany.mockResolvedValue({ count: 1 });
    prisma.chatMemory.createMany.mockResolvedValue({ count: 0 });
    prisma.chatMemory.findMany.mockResolvedValue([]);
    prisma.$transaction.mockResolvedValue([{}, {}] as any);

    mockAiProcessAssistantChat.mockResolvedValue(createAssistantStreamResult());
  });

  it("passes the chat cursor into assistant processing and persists the highest seen revision", async () => {
    mockAiProcessAssistantChat.mockImplementationOnce(async (args) => {
      args.onRulesStateExposed?.(4);
      args.onRulesStateExposed?.(6);
      args.onRulesStateExposed?.(5);

      return createAssistantStreamResult();
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(mockAiProcessAssistantChat).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "chat-1",
        chatLastSeenRulesRevision: 2,
        chatHasHistory: false,
      }),
    );
    expect(prisma.chat.updateMany).toHaveBeenCalledWith({
      where: {
        id: "chat-1",
        OR: [
          { lastSeenRulesRevision: null },
          { lastSeenRulesRevision: { lt: 6 } },
        ],
      },
      data: {
        lastSeenRulesRevision: 6,
      },
    });
  });

  it("returns 404 when the email account cannot be loaded", async () => {
    mockGetEmailAccountWithAi.mockResolvedValueOnce(null);

    const response = await POST(createRequest());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Email account not found",
    });
    expect(mockGetInboxStatsForChatContext).not.toHaveBeenCalled();
    expect(mockAiProcessAssistantChat).not.toHaveBeenCalled();
  });

  it("records the first seen rules revision for chats that have not seen rules yet", async () => {
    prisma.chat.findUnique.mockResolvedValueOnce({
      id: "chat-1",
      emailAccountId: "email-account-id",
      lastSeenRulesRevision: null,
      messages: [],
      compactions: [],
    });
    mockAiProcessAssistantChat.mockImplementationOnce(async (args) => {
      args.onRulesStateExposed?.(3);
      return createAssistantStreamResult();
    });

    await POST(createRequest());

    expect(mockAiProcessAssistantChat).toHaveBeenCalledWith(
      expect.objectContaining({
        chatLastSeenRulesRevision: null,
        chatHasHistory: false,
      }),
    );
    expect(prisma.chat.updateMany).toHaveBeenCalledWith({
      where: {
        id: "chat-1",
        OR: [
          { lastSeenRulesRevision: null },
          { lastSeenRulesRevision: { lt: 3 } },
        ],
      },
      data: {
        lastSeenRulesRevision: 3,
      },
    });
  });

  it("does not persist a rules revision when no rule state was exposed", async () => {
    await POST(createRequest());

    expect(prisma.chat.updateMany).not.toHaveBeenCalled();
  });

  it("marks chats with prior messages as having history", async () => {
    prisma.chat.findUnique.mockResolvedValueOnce({
      id: "chat-1",
      emailAccountId: "email-account-id",
      lastSeenRulesRevision: null,
      messages: [
        {
          id: "assistant-message-1",
          role: "assistant",
          parts: [{ type: "text", text: "Earlier reply" }],
          createdAt: new Date("2026-03-27T10:00:00.000Z"),
        },
      ],
      compactions: [],
    });

    await POST(createRequest());

    expect(mockAiProcessAssistantChat).toHaveBeenCalledWith(
      expect.objectContaining({
        chatHasHistory: true,
      }),
    );
  });

  it("extracts and persists memories from the pre-compaction conversation stream", async () => {
    const compactedBeforeCreatedAt = new Date("2026-03-27T09:00:00.000Z");
    const recentMessageCreatedAt = new Date("2026-03-27T10:00:00.000Z");

    prisma.chat.findUnique.mockResolvedValueOnce({
      id: "chat-1",
      emailAccountId: "email-account-id",
      lastSeenRulesRevision: null,
      messages: [
        {
          id: "user-message-0",
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please remember that I prefer concise responses.",
            },
          ],
          createdAt: recentMessageCreatedAt,
        },
      ],
      compactions: [
        {
          id: "compaction-0",
          summary: "The user prefers short replies.",
          compactedBeforeCreatedAt,
        },
      ],
    });
    mockConvertToUIMessages.mockReturnValue([
      {
        id: "user-message-0",
        role: "user",
        parts: [
          {
            type: "text",
            text: "Please remember that I prefer concise responses.",
          },
        ],
      },
    ]);
    mockConvertToModelMessages.mockResolvedValueOnce([
      {
        role: "user",
        content: "Please remember that I prefer concise responses.",
      },
      {
        role: "user",
        content: "Update my rules",
      },
    ]);
    mockShouldCompact.mockReturnValueOnce(true);
    mockCompactMessages.mockResolvedValueOnce({
      compactedMessages: [
        {
          role: "system",
          content: "Summary of earlier conversation:\nCompacted summary",
        },
        {
          role: "user",
          content: "Update my rules",
        },
      ],
      summary: "Compacted summary",
      compactedCount: 2,
    });
    mockExtractMemories.mockResolvedValueOnce([
      {
        content: "I prefer concise responses.",
      },
    ]);

    await POST(createRequest());

    expect(mockExtractMemories).toHaveBeenCalledWith({
      messages: [
        {
          role: "user",
          content: "Please remember that I prefer concise responses.",
        },
        {
          role: "user",
          content: "Update my rules",
        },
      ],
      user: expect.anything(),
    });
    expect(prisma.chatMemory.createMany).toHaveBeenCalledWith({
      data: [
        {
          content: "I prefer concise responses.",
          chatId: "chat-1",
          emailAccountId: "email-account-id",
        },
      ],
      skipDuplicates: true,
    });
    expect(mockAiProcessAssistantChat).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "system",
            content: "Summary of earlier conversation:\nCompacted summary",
          },
          {
            role: "user",
            content: "Update my rules",
          },
        ],
        conversationMessagesForMemory: [
          {
            role: "user",
            content: "Please remember that I prefer concise responses.",
          },
          {
            role: "user",
            content: "Update my rules",
          },
        ],
      }),
    );
  });

  it("logs and rethrows when saving the rules revision fails", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    prisma.chat.updateMany.mockRejectedValueOnce(new Error("db down"));
    mockAiProcessAssistantChat.mockImplementationOnce(async (args) => {
      args.onRulesStateExposed?.(3);
      return createAssistantStreamResult();
    });

    try {
      await expect(POST(createRequest())).rejects.toThrow("db down");
      expect(consoleErrorSpy.mock.calls.flat()).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Failed to save rules revision"),
        ]),
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("does not persist empty assistant messages", async () => {
    streamState.finishMessages = [
      {
        id: "assistant-empty",
        role: "assistant",
        parts: [],
      },
    ];
    mockAiProcessAssistantChat.mockResolvedValueOnce(
      createAssistantStreamResult({
        finishMessage: streamState.finishMessages[0],
      }),
    );

    await POST(createRequest());

    expect(prisma.chatMessage.createMany).not.toHaveBeenCalled();
  });
});

function createRequest() {
  return new NextRequest("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      id: "chat-1",
      message: {
        id: "user-message-1",
        role: "user",
        parts: [{ type: "text", text: "Update my rules" }],
      },
    }),
  });
}

function createAssistantStreamResult({
  finishMessage = streamState.finishMessages[0] ?? null,
}: {
  finishMessage?: (typeof streamState.finishMessages)[number] | null;
} = {}) {
  return {
    toUIMessageStream: ({
      onFinish,
    }: {
      onFinish?: (event: {
        responseMessage: (typeof streamState.finishMessages)[number] | null;
      }) => void;
    }) =>
      (async function* () {
        onFinish?.({
          responseMessage: finishMessage,
        });
        yield { type: "text-start", id: "part-1" };
        yield { type: "text-end", id: "part-1" };
      })(),
  };
}
