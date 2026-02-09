import { convertToModelMessages, type UIMessage } from "ai";
import prisma from "@/utils/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import { createSlackClient } from "@inboxzero/slack";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import type { Logger } from "@/utils/logger";
import type { Prisma } from "@/generated/prisma/client";

type SlackEventPayload = {
  team_id: string;
  event: {
    type: string;
    user?: string;
    bot_id?: string;
    text?: string;
    channel?: string;
    channel_type?: string;
    ts?: string;
    thread_ts?: string;
  };
};

export async function processSlackEvent(
  body: SlackEventPayload,
  logger: Logger,
): Promise<void> {
  const { team_id: teamId, event } = body;
  const { type, user, bot_id, text, channel, ts, thread_ts, channel_type } =
    event;

  if (!type || !channel || !ts) return;

  // Ignore bot messages
  if (bot_id || !user) return;

  // Only handle messages and app_mentions
  if (type !== "message" && type !== "app_mention") return;

  // For DMs, only process direct messages (not channel messages)
  if (type === "message" && channel_type !== "im") return;

  const candidates = await prisma.messagingChannel.findMany({
    where: {
      provider: MessagingProvider.SLACK,
      teamId,
      isConnected: true,
      accessToken: { not: null },
    },
    select: {
      id: true,
      accessToken: true,
      providerUserId: true,
      emailAccountId: true,
    },
  });

  if (candidates.length === 0) {
    logger.info("No messaging channel found for Slack event", { teamId });
    return;
  }

  // Disambiguate when multiple accounts share one Slack workspace
  let messagingChannel = candidates[0];
  if (candidates.length > 1) {
    const chatId = thread_ts
      ? `slack-${channel}-${thread_ts}`
      : `slack-${channel}`;
    const existingChat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { emailAccountId: true },
    });
    if (existingChat) {
      const match = candidates.find(
        (c) => c.emailAccountId === existingChat.emailAccountId,
      );
      if (match) messagingChannel = match;
    } else {
      logger.warn("Ambiguous workspace-to-account routing, using first match", {
        teamId,
        candidateCount: candidates.length,
      });
    }
  }

  if (!messagingChannel.accessToken) {
    logger.info("No access token for messaging channel", { teamId });
    return;
  }

  const { emailAccountId, accessToken } = messagingChannel;

  // Strip bot mention from text for app_mention events
  let messageText = text ?? "";
  if (type === "app_mention" && messagingChannel.providerUserId) {
    messageText = messageText
      .replaceAll(`<@${messagingChannel.providerUserId}>`, "")
      .trim();
  }

  if (!messageText) return;

  const emailAccountUser = await getEmailAccountWithAi({ emailAccountId });
  if (!emailAccountUser) {
    logger.error("Email account not found for Slack chat", { emailAccountId });
    return;
  }

  // Deterministic chat ID from Slack context
  const chatId = thread_ts
    ? `slack-${channel}-${thread_ts}`
    : `slack-${channel}`;

  const chat = await prisma.chat.upsert({
    where: { id: chatId },
    create: { id: chatId, emailAccountId },
    update: {},
    include: { messages: true },
  });

  // Build message history
  const existingMessages: UIMessage[] = chat.messages.map((m) => ({
    id: m.id,
    role: m.role as UIMessage["role"],
    parts: m.parts as UIMessage["parts"],
  }));

  const userMessageId = `slack-${ts}`;
  const newUserMessage: UIMessage = {
    id: userMessageId,
    role: "user",
    parts: [{ type: "text", text: messageText }],
  };

  const allMessages = [...existingMessages, newUserMessage];

  // Save user message (upsert to handle Slack retries gracefully)
  await prisma.chatMessage.upsert({
    where: { id: userMessageId },
    create: {
      id: userMessageId,
      chat: { connect: { id: chat.id } },
      role: "user",
      parts: newUserMessage.parts as Prisma.InputJsonValue,
    },
    update: {},
  });

  const client = createSlackClient(accessToken);
  const replyThreadTs = type === "app_mention" ? (thread_ts ?? ts) : undefined;

  // Process with AI
  const slackLogger = logger.with({ teamId, channel, emailAccountId });
  let fullText: string;
  try {
    const result = await aiProcessAssistantChat({
      messages: convertToModelMessages(allMessages),
      emailAccountId,
      user: emailAccountUser,
      logger: slackLogger,
    });
    fullText = await result.text;
  } catch (error) {
    slackLogger.error("AI processing failed for Slack message", { error });
    await client.chat.postMessage({
      channel,
      text: "Sorry, I ran into an error processing your message. Please try again.",
      ...(replyThreadTs ? { thread_ts: replyThreadTs } : {}),
    });
    return;
  }

  // Save assistant message
  const assistantParts = [{ type: "text" as const, text: fullText }];
  await prisma.chatMessage.create({
    data: {
      chat: { connect: { id: chat.id } },
      role: "assistant",
      parts: assistantParts as unknown as Prisma.InputJsonValue,
    },
  });

  await client.chat.postMessage({
    channel,
    text: fullText,
    ...(replyThreadTs ? { thread_ts: replyThreadTs } : {}),
  });
}
