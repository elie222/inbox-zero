import { convertToModelMessages, type UIMessage } from "ai";
import prisma from "@/utils/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import {
  createSlackClient,
  markdownToSlackMrkdwn,
  addReaction,
  removeReaction,
} from "@inboxzero/slack";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import { getInboxStatsForChatContext } from "@/utils/ai/assistant/get-inbox-stats-for-chat-context";
import { formatUtcDate } from "@/utils/date";
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

// Keep model input bounded per turn; full history is still persisted in Chat/ChatMessage.
const MAX_SLACK_CONTEXT_MESSAGES = 12;
const MAX_CHAT_MEMORIES = 20;

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

  // Only handle DMs and channel @mentions
  if (type !== "message" && type !== "app_mention") return;

  // For messages, only process DMs (not channel messages without @mention)
  if (type === "message" && channel_type !== "im") return;

  // Auth check: only match channels authorized for this Slack user
  const candidates = await prisma.messagingChannel.findMany({
    where: {
      provider: MessagingProvider.SLACK,
      teamId,
      isConnected: true,
      accessToken: { not: null },
      providerUserId: user,
    },
    select: {
      id: true,
      accessToken: true,
      botUserId: true,
      emailAccountId: true,
      channelId: true,
    },
  });

  if (candidates.length === 0) {
    await sendUnauthorizedMessage({ teamId, channel, logger });
    return;
  }

  const messagingChannel = await resolveMessagingChannel({
    candidates,
    type,
    channel,
    thread_ts,
    logger,
    teamId,
  });

  if (!messagingChannel) return;

  if (!messagingChannel.accessToken) {
    logger.info("No access token for messaging channel", { teamId });
    return;
  }

  const { emailAccountId, accessToken } = messagingChannel;

  // Strip bot mention from text for app_mention events
  let messageText = text ?? "";
  if (type === "app_mention" && messagingChannel.botUserId) {
    messageText = messageText
      .replaceAll(`<@${messagingChannel.botUserId}>`, "")
      .trim();
  }

  if (!messageText) return;

  const emailAccountUser = await getEmailAccountWithAi({ emailAccountId });
  if (!emailAccountUser) {
    logger.error("Email account not found for Slack chat", { emailAccountId });
    return;
  }

  // Deterministic chat ID from Slack context
  const chatThreadTs = type === "app_mention" ? (thread_ts ?? ts) : thread_ts;
  const chatId = chatThreadTs
    ? `slack-${channel}-${chatThreadTs}`
    : `slack-${channel}`;

  const chat = await prisma.chat.upsert({
    where: { id: chatId },
    create: { id: chatId, emailAccountId },
    update: {},
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: MAX_SLACK_CONTEXT_MESSAGES,
      },
    },
  });

  // Build message history
  const existingMessages: UIMessage[] = [...chat.messages]
    .reverse()
    .map((m) => ({
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

  const slackLogger = logger.with({ teamId, channel, emailAccountId });
  const inboxStatsPromise = getInboxStatsForChatContext({
    emailAccountId,
    provider: emailAccountUser.account.provider,
    logger: slackLogger,
  });
  const memoriesPromise = getRecentChatMemories({
    emailAccountId,
    logger: slackLogger,
  });

  // Acknowledge receipt with a reaction
  await addReaction(client, channel, ts, "eyes", slackLogger);

  // Process with AI
  try {
    let fullText: string;
    try {
      const inboxStats = await inboxStatsPromise;
      const result = await aiProcessAssistantChat({
        messages: await convertToModelMessages(allMessages),
        emailAccountId,
        user: emailAccountUser,
        chatId: chat.id,
        memories: await memoriesPromise,
        inboxStats,
        responseSurface: "messaging",
        messagingPlatform: "slack",
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
      text: markdownToSlackMrkdwn(fullText),
      mrkdwn: true,
      ...(replyThreadTs ? { thread_ts: replyThreadTs } : {}),
    });
  } finally {
    await removeReaction(client, channel, ts, "eyes", slackLogger);
  }
}

async function getRecentChatMemories({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<{ content: string; date: string }[]> {
  try {
    const memories = await prisma.chatMemory.findMany({
      where: { emailAccountId },
      orderBy: { createdAt: "desc" },
      take: MAX_CHAT_MEMORIES,
      select: { content: true, createdAt: true },
    });

    return memories.map((memory) => ({
      content: memory.content,
      date: formatUtcDate(memory.createdAt),
    }));
  } catch (error) {
    logger.warn("Failed to load memories for Slack chat", { error });
    return [];
  }
}

type Candidate = {
  id: string;
  accessToken: string | null;
  botUserId: string | null;
  emailAccountId: string;
  channelId: string | null;
};

async function sendUnauthorizedMessage({
  teamId,
  channel,
  logger,
}: {
  teamId: string;
  channel: string;
  logger: Logger;
}) {
  const anyChannel = await prisma.messagingChannel.findFirst({
    where: {
      provider: MessagingProvider.SLACK,
      teamId,
      isConnected: true,
      accessToken: { not: null },
    },
    select: { accessToken: true },
  });

  if (anyChannel?.accessToken) {
    try {
      const client = createSlackClient(anyChannel.accessToken);
      await client.chat.postMessage({
        channel,
        text: "To use this bot, connect your Inbox Zero account to Slack from your settings page.",
      });
    } catch (error) {
      logger.error("Failed to send unauthorized message", { error, teamId });
    }
  }

  logger.info("Unauthorized Slack user attempted bot access", { teamId });
}

async function resolveMessagingChannel({
  candidates,
  type,
  channel,
  thread_ts,
  logger,
  teamId,
}: {
  candidates: Candidate[];
  type: string;
  channel: string;
  thread_ts: string | undefined;
  logger: Logger;
  teamId: string;
}): Promise<Candidate | null> {
  // For @mentions in channels, always enforce channel assignment
  if (type === "app_mention") {
    const channelMatch = candidates.find((c) => c.channelId === channel);
    if (channelMatch) return channelMatch;

    // Tell the user this channel isn't linked
    const firstToken = candidates[0].accessToken;
    if (firstToken) {
      try {
        const client = createSlackClient(firstToken);
        await client.chat.postMessage({
          channel,
          text: "This channel isn't linked to an email account. Set one up in your Inbox Zero settings.",
        });
      } catch (error) {
        logger.error("Failed to send unlinked channel message", { error });
      }
    }

    logger.info("No email account assigned to this channel", {
      teamId,
      channel,
    });
    return null;
  }

  // For DMs: single account can be used directly
  if (candidates.length === 1) return candidates[0];

  // For DMs with multiple accounts, check for existing chat thread
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
    if (match) return match;
  }

  // Multiple accounts in DMs — use first match.
  // Users should use dedicated private channels for specific accounts.
  logger.warn("Multiple accounts in DM, using first match", {
    teamId,
    candidateCount: candidates.length,
  });
  return candidates[0];
}
