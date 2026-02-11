import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

const mockSendWhatsAppTextMessage = vi.fn().mockResolvedValue({});
vi.mock("@inboxzero/whatsapp", () => ({
  sendWhatsAppTextMessage: (...args: unknown[]) =>
    mockSendWhatsAppTextMessage(...args),
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

import { processWhatsAppEvent } from "./process-whatsapp-event";

const logger = createScopedLogger("test-whatsapp");

function makePayload({
  wabaId = "waba-1",
  phoneNumberId = "phone-1",
  message = {
    id: "wamid-1",
    from: "15551230000",
    type: "text",
    text: { body: "hello" },
  },
}: {
  wabaId?: string;
  phoneNumberId?: string;
  message?: {
    id?: string;
    from?: string;
    type?: string;
    text?: { body?: string };
  };
}) {
  return {
    entry: [
      {
        id: wabaId,
        changes: [
          {
            value: {
              metadata: { phone_number_id: phoneNumberId },
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

describe("processWhatsAppEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.messagingChannel.findFirst.mockResolvedValue({
      accessToken: "wa-token",
      emailAccountId: "email-1",
      authorizedSenderId: "15551230000",
    } as any);
    prisma.messagingInboundEvent.create.mockResolvedValue({} as any);
    prisma.chatMessage.findUnique.mockResolvedValue(null);
    prisma.chat.upsert.mockResolvedValue({
      id: "whatsapp-phone-1-15551230000",
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

    await processWhatsAppEvent(makePayload({}), logger);

    expect(prisma.messagingChannel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: "WHATSAPP",
          teamId: "waba-1",
          providerUserId: "phone-1",
        }),
      }),
    );
    expect(aiProcessAssistantChat).toHaveBeenCalled();
    expect(mockSendWhatsAppTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumberId: "phone-1",
        to: "15551230000",
        text: "AI response",
      }),
    );
  });

  it("sends unsupported-type reply for non-text messages", async () => {
    const { aiProcessAssistantChat } = await import(
      "@/utils/ai/assistant/chat"
    );

    await processWhatsAppEvent(
      makePayload({
        message: {
          id: "wamid-2",
          from: "15551230000",
          type: "image",
        },
      }),
      logger,
    );

    expect(aiProcessAssistantChat).not.toHaveBeenCalled();
    expect(mockSendWhatsAppTextMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "We don't support this message type yet.",
      }),
    );
  });

  it("skips events from unauthorized senders", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue({
      accessToken: "wa-token",
      emailAccountId: "email-1",
      authorizedSenderId: "15551239999",
    } as any);

    await processWhatsAppEvent(makePayload({}), logger);

    expect(prisma.messagingInboundEvent.create).not.toHaveBeenCalled();
    expect(prisma.chat.upsert).not.toHaveBeenCalled();
    expect(mockSendWhatsAppTextMessage).not.toHaveBeenCalled();
  });

  it("does nothing when no connected channel exists", async () => {
    prisma.messagingChannel.findFirst.mockResolvedValue(null);

    await processWhatsAppEvent(makePayload({}), logger);

    expect(prisma.chat.upsert).not.toHaveBeenCalled();
    expect(mockSendWhatsAppTextMessage).not.toHaveBeenCalled();
  });

  it("skips duplicate inbound messages by message id", async () => {
    const { aiProcessAssistantChat } = await import(
      "@/utils/ai/assistant/chat"
    );
    prisma.messagingInboundEvent.create.mockRejectedValue({ code: "P2002" });

    await processWhatsAppEvent(makePayload({}), logger);

    expect(aiProcessAssistantChat).not.toHaveBeenCalled();
    expect(prisma.chat.upsert).not.toHaveBeenCalled();
    expect(mockSendWhatsAppTextMessage).not.toHaveBeenCalled();
  });
});
