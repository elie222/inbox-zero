import { convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { NextResponse } from "next/server";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { Prisma } from "@prisma/client";
import { convertToUIMessages } from "@/components/assistant-chat/helpers";
import { captureException } from "@/utils/error";

export const maxDuration = 120;

const logger = createScopedLogger("api/chat");

const textPartSchema = z.object({
  text: z.string().min(1).max(3000),
  type: z.enum(["text"]),
});

const assistantInputSchema = z.object({
  id: z.string(),
  message: z.object({
    id: z.string(),
    role: z.enum(["user"]),
    parts: z.array(textPartSchema),
  }),
});

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const user = await getEmailAccountWithAi({ emailAccountId });

  if (!user) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const { data, error } = assistantInputSchema.safeParse(json);

  if (error) return NextResponse.json({ error: error.errors }, { status: 400 });

  const chat =
    (await getChatById(data.id)) ||
    (await createNewChat({ emailAccountId, chatId: data.id }));

  if (!chat) {
    return NextResponse.json(
      { error: "Failed to get or create chat" },
      { status: 500 },
    );
  }

  if (chat.emailAccountId !== emailAccountId) {
    return NextResponse.json(
      { error: "You are not authorized to access this chat" },
      { status: 403 },
    );
  }

  const { message } = data;
  const uiMessages = [...convertToUIMessages(chat), message];

  await saveChatMessage({
    chat: { connect: { id: chat.id } },
    id: message.id,
    role: "user",
    parts: message.parts,
  });

  try {
    const result = await aiProcessAssistantChat({
      messages: convertToModelMessages(uiMessages),
      emailAccountId,
      user,
    });

    return result.toUIMessageStreamResponse({
      onFinish: async ({ messages }) => {
        await saveChatMessages(messages, chat.id);
      },
    });
  } catch (error) {
    logger.error("Error in assistant chat", { error });
    return NextResponse.json(
      { error: "Error in assistant chat" },
      { status: 500 },
    );
  }
});

async function createNewChat({
  emailAccountId,
  chatId,
}: {
  emailAccountId: string;
  chatId: string;
}) {
  try {
    const newChat = await prisma.chat.create({
      data: { emailAccountId, id: chatId },
      include: { messages: true },
    });
    logger.info("New chat created", { chatId: newChat.id, emailAccountId });
    return newChat;
  } catch (error) {
    logger.error("Failed to create new chat", { error, emailAccountId });
    return undefined;
  }
}

async function getChatById(chatId: string) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { messages: true },
  });
  return chat;
}

async function saveChatMessage(message: Prisma.ChatMessageCreateInput) {
  return prisma.chatMessage.create({ data: message });
}

async function saveChatMessages(messages: UIMessage[], chatId: string) {
  try {
    return prisma.chatMessage.createMany({
      data: messages.map((message) => ({
        id: message.id,
        chatId,
        role: message.role,
        parts: message.parts as Prisma.InputJsonValue,
      })),
    });
  } catch (error) {
    logger.error("Failed to save chat messages", { error, chatId });
    captureException(error, { extra: { chatId } });
    throw error;
  }
}
