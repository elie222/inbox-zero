import { convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { NextResponse } from "next/server";
import { ChatType, type Prisma } from "@/generated/prisma/client";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailAccountWithAiInsights } from "@/utils/user/get";
import { aiProcessAgentChat } from "@/utils/ai/agent/agent";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";

export const maxDuration = 120;

const textPartSchema = z.object({
  text: z.string().min(1).max(3000),
  type: z.enum(["text"]),
});

const agentInputSchema = z.object({
  id: z.string(),
  message: z.object({
    id: z.string(),
    role: z.enum(["user"]),
    parts: z.array(textPartSchema),
  }),
  context: z
    .object({
      mode: z
        .enum(["chat", "onboarding", "processing_email", "test"])
        .optional(),
      emailId: z.string().optional(),
      threadId: z.string().optional(),
      dryRun: z.boolean().optional(),
    })
    .optional(),
});

export const POST = withEmailAccount("agent-chat", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const user = await getEmailAccountWithAiInsights({ emailAccountId });

  if (!user) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const { data, error } = agentInputSchema.safeParse(json);

  if (error) return NextResponse.json({ error: error.errors }, { status: 400 });

  const chat =
    (await getChatById(data.id)) ||
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
  const uiMessages = [...convertChatToUIMessages(chat), message];

  await saveChatMessage({
    chat: { connect: { id: chat.id } },
    id: message.id,
    role: "user",
    parts: message.parts,
  });

  const email =
    context?.emailId && user?.account?.provider
      ? await loadEmailContext({
          emailAccountId,
          provider: user.account.provider,
          emailId: context.emailId,
          logger: request.logger,
        })
      : undefined;

  try {
    const result = await aiProcessAgentChat({
      messages: await convertToModelMessages(uiMessages),
      emailAccount: user,
      logger: request.logger,
      context: {
        mode: context?.mode ?? "chat",
        email,
        dryRun: context?.dryRun,
      },
    });

    return result.toUIMessageStreamResponse({
      onFinish: async ({ messages }) => {
        await saveChatMessages(messages, chat.id, request.logger);
      },
    });
  } catch (error) {
    request.logger.error("Error in agent chat", { error });
    return NextResponse.json({ error: "Error in agent chat" }, { status: 500 });
  }
});

async function loadEmailContext({
  emailAccountId,
  provider,
  emailId,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  emailId: string;
  logger: Logger;
}) {
  try {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });
    return await emailProvider.getMessage(emailId);
  } catch (error) {
    logger.warn("Failed to load email context", { error, emailId });
    return undefined;
  }
}

function convertChatToUIMessages(chat: {
  messages: Array<{
    id: string;
    role: string;
    parts: Prisma.JsonValue;
  }>;
}): UIMessage[] {
  return chat.messages.map((message) => ({
    id: message.id,
    role: message.role as UIMessage["role"],
    parts: message.parts as UIMessage["parts"],
  }));
}

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
      data: { emailAccountId, id: chatId, type: ChatType.AGENT },
      include: { messages: true },
    });
    logger.info("New agent chat created", {
      chatId: newChat.id,
      emailAccountId,
    });
    return newChat;
  } catch (error) {
    logger.error("Failed to create new agent chat", { error, emailAccountId });
    return undefined;
  }
}

async function getChatById(chatId: string) {
  const chat = await prisma.chat.findFirst({
    where: { id: chatId, type: ChatType.AGENT },
    include: { messages: true },
  });
  return chat;
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
      skipDuplicates: true,
    });
  } catch (error) {
    logger.error("Failed to save agent chat messages", { error, chatId });
    throw error;
  }
}
