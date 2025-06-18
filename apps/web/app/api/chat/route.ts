import { appendClientMessage, appendResponseMessages } from "ai";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { NextResponse } from "next/server";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { Prisma, type ChatMessage } from "@prisma/client";

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
    createdAt: z.coerce.date(),
    role: z.enum(["user"]),
    content: z.string().min(1).max(3000),
    parts: z.array(textPartSchema),
    // experimental_attachments: z
    //   .array(
    //     z.object({
    //       url: z.string().url(),
    //       name: z.string().min(1).max(100),
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

  if (error) return NextResponse.json({ error: error.errors }, { status: 400 });

  // create chat if it doesn't exist
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
  const mappedDbMessages = chat.messages.map((dbMsg: ChatMessage) => {
    return {
      ...dbMsg,
      role: convertDbRoleToSdkRole(dbMsg.role),
      content: "",
      parts: dbMsg.parts as any,
    };
  });

  const messages = appendClientMessage({
    messages: mappedDbMessages,
    message,
  });

  await saveChatMessage({
    chat: { connect: { id: chat.id } },
    id: message.id,
    role: "user",
    parts: message.parts,
    // attachments: message.experimental_attachments ?? [],
  });

  try {
    const result = await aiProcessAssistantChat({
      messages,
      emailAccountId,
      user,
      onFinish: async ({ response }) => {
        const assistantMessages = response.messages.filter(
          (message) => message.role === "assistant",
        );
        const assistantId = getTrailingMessageId(assistantMessages);

        if (!assistantId) {
          logger.error("No assistant message found!", { response });
          throw new Error("No assistant message found!");
        }

        // handles all tool calls
        const [, assistantMessage] = appendResponseMessages({
          messages: [message],
          responseMessages: response.messages,
        });

        await saveChatMessage({
          id: assistantId,
          chat: { connect: { id: chat.id } },
          role: assistantMessage.role,
          parts: assistantMessage.parts
            ? (assistantMessage.parts as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          // attachments: assistantMessage.experimental_attachments ?? [],
        });
      },
    });

    return result.toDataStreamResponse();
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

async function saveChatMessage(message: Prisma.ChatMessageCreateInput) {
  return prisma.chatMessage.create({ data: message });
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

function getTrailingMessageId<T extends { id: string }>(
  messages: Array<T>,
): string | null {
  const trailingMessage = messages.at(-1);

  if (!trailingMessage) return null;

  return trailingMessage.id;
}
