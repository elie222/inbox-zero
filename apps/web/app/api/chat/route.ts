import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { NextResponse } from "next/server";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { appendClientMessage } from "ai";

export const maxDuration = 120;

const logger = createScopedLogger("api/chat");

const textPartSchema = z.object({
  text: z.string().min(1).max(2000),
  type: z.enum(["text"]),
});

export const assistantInputSchema = z.object({
  chatId: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    createdAt: z.coerce.date(),
    role: z.enum(["user"]),
    content: z.string().min(1).max(2000),
    parts: z.array(textPartSchema),
    // experimental_attachments: z
    //   .array(
    //     z.object({
    //       url: z.string().url(),
    //       name: z.string().min(1).max(2000),
    //       contentType: z.enum(["image/png", "image/jpg", "image/jpeg"]),
    //     }),
    //   )
    //   .optional(),
  }),
});

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const user = await getEmailAccountWithAi({ emailAccountId });

  if (!user) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const { data, error } = assistantInputSchema.safeParse(json);

  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  const chat = data.chatId
    ? await getChatById(data.chatId)
    : await createNewChat(emailAccountId);

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
  const mappedDbMessages = chat.messages.map((dbMsg) => {
    return {
      ...dbMsg,
      role: convertDbRoleToSdkRole(dbMsg.role),
    };
  });

  const messages = appendClientMessage({
    messages: mappedDbMessages,
    message,
  });

  const result = await aiProcessAssistantChat({
    messages,
    emailAccountId,
    user,
    onFinish: (messages: any) => {
      saveChatMessages({
        messagesToSave: messages,
        chatId: chat.id,
      });
    },
  });

  return result.toDataStreamResponse();
});

async function createNewChat(emailAccountId: string) {
  try {
    const newChat = await prisma.chat.create({
      data: { emailAccountId },
      include: { messages: true },
    });
    logger.info("New chat created", { chatId: newChat.id, emailAccountId });
    return newChat;
  } catch (error) {
    logger.error("Failed to create new chat", { error, emailAccountId });
    return undefined;
  }
}

async function saveChatMessages({
  messagesToSave,
  chatId,
}: {
  messagesToSave: {
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    attachments?: any[];
    metadata?: Record<string, any>;
  }[];
  chatId: string;
}): Promise<boolean> {
  if (!chatId) {
    logger.error("saveChatMessages called without a chatId.");
    return false;
  }
  if (!messagesToSave || messagesToSave.length === 0) {
    logger.warn("saveChatMessages called with no messages to save.", {
      chatId,
    });
    return true; // No messages to save is not an error in this context
  }

  try {
    const prismaMessagesData = messagesToSave.map((msg) => {
      const mappedRole = msg.role.toUpperCase();

      const attachmentsToSave =
        msg.attachments && msg.attachments.length > 0
          ? msg.attachments
          : undefined;
      const metadataToSave =
        msg.metadata && Object.keys(msg.metadata).length > 0
          ? msg.metadata
          : undefined;

      return {
        chatId: chatId,
        role: mappedRole,
        content: msg.content,
        attachments: attachmentsToSave,
        metadata: metadataToSave,
      };
    });

    await prisma.chatMessage.createMany({
      data: prismaMessagesData,
      skipDuplicates: false, // If a message might be re-processed, this could be true if unique IDs are part of input
    });

    logger.info("Successfully saved chat messages", { chatId });
    return true;
  } catch (error) {
    logger.error("Failed to save chat messages to DB", {
      error,
      chatId: chatId,
      numberOfMessages: messagesToSave.length,
    });
    return false;
  }
}

async function getChatById(chatId: string) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { messages: true },
  });
  return chat;
}

function convertDbRoleToSdkRole(
  role: string,
): "user" | "assistant" | "system" | "data" {
  switch (role) {
    case "user":
      return "user";
    case "assistant":
      return "assistant";
    case "system":
      return "system";
    case "data":
      return "data";
    default:
      return "assistant";
  }
}
