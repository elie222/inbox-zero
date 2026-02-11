import { convertToModelMessages, type UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma/client";
import { MessagingProvider } from "@/generated/prisma/enums";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { sendWhatsAppTextMessage } from "@inboxzero/whatsapp";

type WhatsAppWebhookPayload = {
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: {
        metadata?: {
          phone_number_id?: string;
        };
        messages?: WhatsAppInboundMessage[];
      };
    }>;
  }>;
};

type WhatsAppInboundMessage = {
  id?: string;
  from?: string;
  type?: string;
  text?: {
    body?: string;
  };
};

const UNSUPPORTED_MESSAGE_TYPE_REPLY =
  "We don't support this message type yet.";
const ASSISTANT_ERROR_REPLY =
  "Sorry, I ran into an error processing your message. Please try again.";

export async function processWhatsAppEvent(
  body: WhatsAppWebhookPayload,
  logger: Logger,
): Promise<void> {
  for (const entry of body.entry ?? []) {
    const wabaId = entry.id;
    if (!wabaId) continue;

    for (const change of entry.changes ?? []) {
      const phoneNumberId = change.value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      for (const message of change.value?.messages ?? []) {
        await processInboundMessage({
          wabaId,
          phoneNumberId,
          message,
          logger,
        });
      }
    }
  }
}

async function processInboundMessage({
  wabaId,
  phoneNumberId,
  message,
  logger,
}: {
  wabaId: string;
  phoneNumberId: string;
  message: WhatsAppInboundMessage;
  logger: Logger;
}) {
  if (!message.id || !message.from || !message.type) return;
  const senderWaId = normalizeWhatsAppSenderId(message.from);
  if (!senderWaId) return;

  logger.trace("Received WhatsApp message", {
    senderWaId,
    type: message.type,
    phoneNumberId,
  });

  const messagingChannel = await prisma.messagingChannel.findFirst({
    where: {
      provider: MessagingProvider.WHATSAPP,
      teamId: wabaId,
      providerUserId: phoneNumberId,
      isConnected: true,
      accessToken: { not: null },
    },
    select: {
      accessToken: true,
      emailAccountId: true,
      authorizedSenderId: true,
    },
  });

  if (!messagingChannel?.accessToken) return;
  if (
    !messagingChannel.authorizedSenderId ||
    messagingChannel.authorizedSenderId !== senderWaId
  ) {
    logger.warn("Rejected inbound WhatsApp sender");
    logger.trace("Rejected sender details", {
      senderWaId,
      phoneNumberId,
      wabaId,
    });
    return;
  }

  const inboundEventId = `whatsapp-${phoneNumberId}-${message.id}`;
  const isFirstDelivery = await reserveInboundEvent({
    id: inboundEventId,
    logger,
  });
  if (!isFirstDelivery) return;

  if (message.type !== "text") {
    await sendReply({
      accessToken: messagingChannel.accessToken,
      phoneNumberId,
      to: senderWaId,
      text: UNSUPPORTED_MESSAGE_TYPE_REPLY,
      logger,
      logMessage: "Failed to send unsupported-type reply",
    });
    return;
  }

  const messageText = message.text?.body?.trim();
  if (!messageText) return;

  const userMessageId = inboundEventId;
  const existingUserMessage = await prisma.chatMessage.findUnique({
    where: { id: userMessageId },
    select: { id: true },
  });
  if (existingUserMessage) return;

  const { emailAccountId } = messagingChannel;
  const emailAccountUser = await getEmailAccountWithAi({ emailAccountId });
  if (!emailAccountUser) {
    logger.error("Email account not found for WhatsApp chat", {
      emailAccountId,
    });
    return;
  }

  const chatId = `whatsapp-${phoneNumberId}-${senderWaId}`;
  const chat = await prisma.chat.upsert({
    where: { id: chatId },
    create: { id: chatId, emailAccountId },
    update: {},
    include: { messages: true },
  });

  const existingMessages: UIMessage[] = chat.messages.map((chatMessage) => ({
    id: chatMessage.id,
    role: chatMessage.role as UIMessage["role"],
    parts: chatMessage.parts as UIMessage["parts"],
  }));

  const newUserMessage: UIMessage = {
    id: userMessageId,
    role: "user",
    parts: [{ type: "text", text: messageText }],
  };

  await prisma.chatMessage.upsert({
    where: { id: userMessageId },
    create: {
      id: userMessageId,
      chat: { connect: { id: chatId } },
      role: "user",
      parts: newUserMessage.parts as Prisma.InputJsonValue,
    },
    update: {},
  });

  const allMessages = [...existingMessages, newUserMessage];
  let fullText: string;
  try {
    const result = await aiProcessAssistantChat({
      messages: await convertToModelMessages(allMessages),
      emailAccountId,
      user: emailAccountUser,
      logger: logger.with({ emailAccountId, provider: "whatsapp" }),
    });
    fullText = await result.text;
  } catch (error) {
    logger.error("AI processing failed for WhatsApp message", {
      error,
      emailAccountId,
    });
    await sendReply({
      accessToken: messagingChannel.accessToken,
      phoneNumberId,
      to: senderWaId,
      text: ASSISTANT_ERROR_REPLY,
      logger,
      logMessage: "Failed to send assistant error reply",
    });
    return;
  }

  await prisma.chatMessage.create({
    data: {
      chat: { connect: { id: chat.id } },
      role: "assistant",
      parts: [
        { type: "text", text: fullText },
      ] as unknown as Prisma.InputJsonValue,
    },
  });

  await sendReply({
    accessToken: messagingChannel.accessToken,
    phoneNumberId,
    to: senderWaId,
    text: fullText,
    logger,
    logMessage: "Failed to send WhatsApp assistant reply",
  });
}

async function sendReply({
  accessToken,
  phoneNumberId,
  to,
  text,
  logger,
  logMessage,
}: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  text: string;
  logger: Logger;
  logMessage: string;
}) {
  try {
    await sendWhatsAppTextMessage({
      accessToken,
      phoneNumberId,
      to,
      text,
    });
  } catch (error) {
    logger.error(logMessage, { error });
  }
}

async function reserveInboundEvent({
  id,
  logger,
}: {
  id: string;
  logger: Logger;
}): Promise<boolean> {
  try {
    await prisma.messagingInboundEvent.create({
      data: {
        id,
        provider: MessagingProvider.WHATSAPP,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      logger.trace("Skipping duplicate WhatsApp delivery", { id });
      return false;
    }
    logger.error("Failed reserving WhatsApp inbound event", { error, id });
    return false;
  }
}

function normalizeWhatsAppSenderId(value: string): string | null {
  const normalized = value.replaceAll(/\D/g, "");
  if (!normalized) return null;
  return normalized;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
