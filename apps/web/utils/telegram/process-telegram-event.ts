import { convertToModelMessages, type UIMessage } from "ai";
import type { Prisma } from "@/generated/prisma/client";
import { MessagingProvider } from "@/generated/prisma/enums";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { sendTelegramTextMessage } from "@inboxzero/telegram";

type TelegramWebhookPayload = {
  update_id?: number;
  message?: TelegramInboundMessage;
};

type TelegramInboundMessage = {
  message_id?: number;
  text?: string;
  from?: {
    id?: number;
    is_bot?: boolean;
  };
  chat?: {
    id?: number;
    type?: string;
  };
};

const UNSUPPORTED_MESSAGE_TYPE_REPLY =
  "We don't support this message type yet.";
const ASSISTANT_ERROR_REPLY =
  "Sorry, I ran into an error processing your message. Please try again.";

export async function processTelegramEvent(
  body: TelegramWebhookPayload,
  botId: string,
  logger: Logger,
): Promise<void> {
  if (!body.message) return;

  await processInboundMessage({
    botId,
    updateId: body.update_id,
    message: body.message,
    logger,
  });
}

async function processInboundMessage({
  botId,
  updateId,
  message,
  logger,
}: {
  botId: string;
  updateId: number | undefined;
  message: TelegramInboundMessage;
  logger: Logger;
}) {
  if (typeof updateId !== "number") return;
  if (!message.message_id) return;

  const senderId = normalizeTelegramSenderId(message.from?.id);
  if (!senderId) return;

  if (message.from?.is_bot) return;

  const chatId = message.chat?.id ? String(message.chat.id) : null;
  if (!chatId) return;

  if (message.chat?.type !== "private") return;

  logger.trace("Received Telegram message", {
    senderId,
    botId,
  });

  const messagingChannel = await prisma.messagingChannel.findFirst({
    where: {
      provider: MessagingProvider.TELEGRAM,
      teamId: botId,
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
    messagingChannel.authorizedSenderId !== senderId
  ) {
    logger.warn("Rejected inbound Telegram sender");
    logger.trace("Rejected Telegram sender details", {
      senderId,
      botId,
    });
    return;
  }

  const inboundEventId = `telegram-${botId}-${updateId}`;
  const isFirstDelivery = await reserveInboundEvent({
    id: inboundEventId,
    logger,
  });
  if (!isFirstDelivery) return;

  const messageText = message.text?.trim();
  if (!messageText) {
    await sendReply({
      botToken: messagingChannel.accessToken,
      chatId,
      text: UNSUPPORTED_MESSAGE_TYPE_REPLY,
      logger,
      logMessage: "Failed to send unsupported-type Telegram reply",
    });
    return;
  }

  const existingUserMessage = await prisma.chatMessage.findUnique({
    where: { id: inboundEventId },
    select: { id: true },
  });
  if (existingUserMessage) return;

  const { emailAccountId } = messagingChannel;
  const emailAccountUser = await getEmailAccountWithAi({ emailAccountId });
  if (!emailAccountUser) {
    logger.error("Email account not found for Telegram chat", {
      emailAccountId,
    });
    return;
  }

  const telegramChatId = `telegram-${botId}-${chatId}`;
  const chat = await prisma.chat.upsert({
    where: { id: telegramChatId },
    create: { id: telegramChatId, emailAccountId },
    update: {},
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  const existingMessages: UIMessage[] = chat.messages.map((chatMessage) => ({
    id: chatMessage.id,
    role: chatMessage.role as UIMessage["role"],
    parts: chatMessage.parts as UIMessage["parts"],
  }));

  const newUserMessage: UIMessage = {
    id: inboundEventId,
    role: "user",
    parts: [{ type: "text", text: messageText }],
  };

  await prisma.chatMessage.upsert({
    where: { id: inboundEventId },
    create: {
      id: inboundEventId,
      chat: { connect: { id: telegramChatId } },
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
      logger: logger.with({ emailAccountId, provider: "telegram" }),
    });
    fullText = await result.text;
  } catch (error) {
    logger.error("AI processing failed for Telegram message", {
      error,
      emailAccountId,
    });
    await sendReply({
      botToken: messagingChannel.accessToken,
      chatId,
      text: ASSISTANT_ERROR_REPLY,
      logger,
      logMessage: "Failed to send Telegram assistant error reply",
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
    botToken: messagingChannel.accessToken,
    chatId,
    text: fullText,
    logger,
    logMessage: "Failed to send Telegram assistant reply",
  });
}

async function sendReply({
  botToken,
  chatId,
  text,
  logger,
  logMessage,
}: {
  botToken: string;
  chatId: string;
  text: string;
  logger: Logger;
  logMessage: string;
}) {
  try {
    await sendTelegramTextMessage({
      botToken,
      chatId,
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
        provider: MessagingProvider.TELEGRAM,
      },
    });
    return true;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      logger.trace("Skipping duplicate Telegram delivery", { id });
      return false;
    }
    throw error;
  }
}

function normalizeTelegramSenderId(value: number | undefined): string | null {
  if (!value || value <= 0) return null;
  return String(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}
