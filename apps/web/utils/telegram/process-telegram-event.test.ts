import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

const mockSendTelegramTextMessage = vi.fn().mockResolvedValue({});
vi.mock("@inboxzero/telegram", () => ({
  sendTelegramTextMessage: (...args: unknown[]) =>
    mockSendTelegramTextMessage(...args),
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
  convertToModelMessages: vi.fn((messages: unknown[]) => messages),
}));

import { processTelegramEvent } from "./process-telegram-event";

const logger = createScopedLogger("test-telegram");

function makePayload({
  updateId = 1,
  message = {
    message_id: 10,
    text: "hello",
    from: { id: 123_456_789, is_bot: false },
    chat: { id: 123_456_789, type: "private" },
  },
}: {
  updateId?: number;
  message?: {
    message_id?: number;
    text?: string;
    from?: { id?: number; is_bot?: boolean };
    chat?: { id?: number; type?: string };
  };
}) {
  return {
    update_id: updateId,
    message,
  };
}

describe("processTelegramEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.messagingChannel.findFirst.mockResolvedValue({
      accessToken: "telegram-token",
      emailAccountId: "email-1",
      authorizedSenderId: "123456789",
    } as any);
    prisma.messagingInboundEvent.create.mockResolvedValue({} as any);
    prisma.chatMessage.findUnique.mockResolvedValue(null);
    prisma.chat.upsert.mockResolvedValue({
      id: "telegram-1001-123456789",
      messages: [],
      emailAccountId: "email-1",
    } as any);
    prisma.chatMessage.upsert.mockResolvedValue({} as any);
    prisma.chatMessage.create.mockResolvedValue({} as any);
  });

  it("processes inbound text and sends assistant reply", async () => {
    const { aiProcessAssistantChat } = await import(
      "@/utils/ai/assistant/chat"
    );

    await processTelegramEvent(makePayload({}), "1001", logger);

    expect(prisma.messagingChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: "TELEGRAM",
          teamId: "1001",
        }),
      }),
    );
    expect(aiProcessAssistantChat).toHaveBeenCalled();
    expect(mockSendTelegramTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: "123456789",
        text: "AI response",
      }),
    );
  });

  it("sends unsupported-type reply for non-text messages", async () => {
    const { aiProcessAssistantChat } = await import(
      "@/utils/ai/assistant/chat"
    );

    await processTelegramEvent(
      makePayload({
        message: {
          message_id: 11,
          from: { id: 123_456_789, is_bot: false },
          chat: { id: 123_456_789, type: "private" },
        },
      }),
      "1001",
      logger,
    );

    expect(aiProcessAssistantChat).not.toHaveBeenCalled();
    expect(mockSendTelegramTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "We don't support this message type yet.",
      }),
    );
  });

  it("skips events from unauthorized senders", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue({
      accessToken: "telegram-token",
      emailAccountId: "email-1",
      authorizedSenderId: "999999999",
    } as any);

    await processTelegramEvent(makePayload({}), "1001", logger);

    expect(prisma.messagingInboundEvent.create).not.toHaveBeenCalled();
    expect(prisma.chat.upsert).not.toHaveBeenCalled();
    expect(mockSendTelegramTextMessage).not.toHaveBeenCalled();
  });

  it("does nothing when no connected channel exists", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue(null);

    await processTelegramEvent(makePayload({}), "1001", logger);

    expect(prisma.chat.upsert).not.toHaveBeenCalled();
    expect(mockSendTelegramTextMessage).not.toHaveBeenCalled();
  });

  it("skips duplicate inbound updates by update id", async () => {
    const { aiProcessAssistantChat } = await import(
      "@/utils/ai/assistant/chat"
    );
    prisma.messagingInboundEvent.create.mockRejectedValue({ code: "P2002" });

    await processTelegramEvent(makePayload({}), "1001", logger);

    expect(aiProcessAssistantChat).not.toHaveBeenCalled();
    expect(prisma.chat.upsert).not.toHaveBeenCalled();
    expect(mockSendTelegramTextMessage).not.toHaveBeenCalled();
  });

  it("throws when reserving inbound event fails with non-duplicate error", async () => {
    prisma.messagingInboundEvent.create.mockRejectedValue(
      new Error("database unavailable"),
    );

    await expect(
      processTelegramEvent(makePayload({}), "1001", logger),
    ).rejects.toThrow("database unavailable");
  });
});
