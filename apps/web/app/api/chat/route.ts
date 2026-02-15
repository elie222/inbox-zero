import { convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { NextResponse } from "next/server";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { convertToUIMessages } from "@/components/assistant-chat/helpers";
import { captureException } from "@/utils/error";
import { messageContextSchema } from "@/app/api/chat/validation";
import {
  shouldCompact,
  compactMessages,
  extractMemories,
  RECENT_MESSAGES_TO_KEEP,
} from "@/utils/ai/assistant/compact";
import { getModel } from "@/utils/llms/model";

export const maxDuration = 120;

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
  context: messageContextSchema.optional(),
});

export const POST = withEmailAccount("chat", async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const user = await getEmailAccountWithAi({ emailAccountId });

  if (!user) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const { data, error } = assistantInputSchema.safeParse(json);

  if (error) return NextResponse.json({ error: error.errors }, { status: 400 });

  const chat =
    (await getChatWithCompactions(data.id)) ||
    (await createNewChat({
      emailAccountId,
      chatId: data.id,
      logger: request.logger,
    }));

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

  const { message, context } = data;

  await saveChatMessage({
    chat: { connect: { id: chat.id } },
    id: message.id,
    role: "user",
    parts: message.parts,
  });

  const latestCompaction = chat.compactions[0];

  const messagesForModel = latestCompaction
    ? chat.messages.filter(
        (m) => m.createdAt >= latestCompaction.compactedBeforeCreatedAt,
      )
    : chat.messages;

  const uiMessages = [
    ...convertToUIMessages({ ...chat, messages: messagesForModel }),
    message,
  ];

  let modelMessages = await convertToModelMessages(uiMessages);

  if (latestCompaction) {
    modelMessages = [
      {
        role: "system" as const,
        content: `Summary of earlier conversation:\n${latestCompaction.summary}`,
      },
      ...modelMessages,
    ];
  }

  const { provider } = getModel(user.user, "chat");

  if (shouldCompact(modelMessages, provider)) {
    try {
      const preCompactionMessages = modelMessages;

      const { compactedMessages, summary, compactedCount } =
        await compactMessages({
          messages: modelMessages,
          user,
          logger: request.logger,
        });

      if (compactedCount > 0 && summary.trim().length > 0) {
        modelMessages = compactedMessages;

        // Compute boundary: keep at least RECENT_MESSAGES_TO_KEEP DB messages.
        // messagesForModel doesn't include the new user message (saved after query),
        // so we keep RECENT_MESSAGES_TO_KEEP from the existing set.
        const keepFromIndex = Math.max(
          0,
          messagesForModel.length - RECENT_MESSAGES_TO_KEEP,
        );
        const compactedBeforeCreatedAt =
          messagesForModel[keepFromIndex]?.createdAt ?? new Date();

        const [, memories] = await Promise.all([
          prisma.$transaction([
            prisma.chatCompaction.create({
              data: {
                chatId: chat.id,
                summary,
                messageCount: compactedCount,
                compactedBeforeCreatedAt,
              },
            }),
            prisma.chat.update({
              where: { id: chat.id },
              data: { compactionCount: { increment: 1 } },
            }),
          ]),
          extractMemories({
            messages: preCompactionMessages,
            user,
          }).catch((err) => {
            request.logger.error("Failed to extract memories", {
              error: err,
            });
            return [];
          }),
        ]);

        if (memories.length > 0) {
          await prisma.chatMemory.createMany({
            data: memories.map((m) => ({
              content: m.content,
              chatId: chat.id,
              emailAccountId,
            })),
            skipDuplicates: true,
          });
        }
      }
    } catch (compactionError) {
      request.logger.error(
        "Chat compaction failed, continuing with full history",
        {
          error: compactionError,
        },
      );
    }
  }

  let memories: { content: string; date: string }[] = [];
  try {
    const recentMemories = await prisma.chatMemory.findMany({
      where: { emailAccountId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { content: true, createdAt: true },
    });
    memories = recentMemories.map((m) => ({
      content: m.content,
      date: m.createdAt.toISOString().split("T")[0],
    }));
  } catch (error) {
    request.logger.warn("Failed to load memories for chat", { error });
  }

  try {
    const result = await aiProcessAssistantChat({
      messages: modelMessages,
      emailAccountId,
      user,
      context,
      chatId: chat.id,
      memories,
      logger: request.logger,
    });

    return result.toUIMessageStreamResponse({
      onFinish: async ({ messages }) => {
        await saveChatMessages(messages, chat.id, request.logger);
      },
    });
  } catch (error) {
    request.logger.error("Error in assistant chat", { error });
    return NextResponse.json(
      { error: "Error in assistant chat" },
      { status: 500 },
    );
  }
});

async function createNewChat({
  emailAccountId,
  chatId,
  logger,
}: {
  emailAccountId: string;
  chatId: string;
  logger: Logger;
}) {
  try {
    const newChat = await prisma.chat.create({
      data: { emailAccountId, id: chatId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        compactions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    logger.info("New chat created", { chatId: newChat.id, emailAccountId });
    return newChat;
  } catch (error) {
    logger.error("Failed to create new chat", { error, emailAccountId });
    return undefined;
  }
}

async function getChatWithCompactions(chatId: string) {
  return prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      compactions: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
}

async function saveChatMessage(message: Prisma.ChatMessageCreateInput) {
  return prisma.chatMessage.create({ data: message });
}

async function saveChatMessages(
  messages: UIMessage[],
  chatId: string,
  logger: Logger,
) {
  try {
    return prisma.chatMessage.createMany({
      data: messages.map((message) => ({
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
