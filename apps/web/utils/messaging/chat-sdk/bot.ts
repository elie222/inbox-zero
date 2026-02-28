import {
  createSlackAdapter,
  type SlackAdapter,
  type SlackEvent,
} from "@chat-adapter/slack";
import { createIoRedisState } from "@chat-adapter/state-ioredis";
import { createMemoryState } from "@chat-adapter/state-memory";
import { createTeamsAdapter, type TeamsAdapter } from "@chat-adapter/teams";
import {
  createTelegramAdapter,
  type TelegramRawMessage,
  type TelegramAdapter,
} from "@chat-adapter/telegram";
import { convertToModelMessages, type UIMessage } from "ai";
import {
  Chat,
  ConsoleLogger,
  type Adapter,
  type Message,
  type Thread,
} from "chat";
import { env } from "@/env";
import type { Prisma } from "@/generated/prisma/client";
import { MessagingProvider } from "@/generated/prisma/enums";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import { getInboxStatsForChatContext } from "@/utils/ai/assistant/get-inbox-stats-for-chat-context";
import { formatUtcDate } from "@/utils/date";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { consumeMessagingLinkCode } from "@/utils/messaging/chat-sdk/link-code-consume";
import prisma from "@/utils/prisma";
import { getEmailAccountWithAi } from "@/utils/user/get";

const MAX_CHAT_CONTEXT_MESSAGES = 12;
const MAX_CHAT_MEMORIES = 20;
const CHAT_SDK_STATE_KEY_PREFIX = "inbox-zero:chat-sdk";
const CONNECT_COMMAND_REGEX =
  /^\/?connect(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9._-]+)\s*$/i;

const SLACK_ASSISTANT_SUGGESTED_PROMPTS = [
  { title: "Inbox summary", message: "Summarize what needs attention today." },
  {
    title: "Draft reply",
    message: "Draft a response to my most urgent unread email.",
  },
  {
    title: "Follow-up list",
    message: "Which emails should I follow up on this week?",
  },
];

type SupportedPlatform = "slack" | "teams" | "telegram";

type MessagingAdapters = {
  slack?: SlackAdapter;
  teams?: TeamsAdapter;
  telegram?: TelegramAdapter;
};

type MessagingChatSdkContext = {
  bot: Chat<Record<string, Adapter>>;
  adapters: MessagingAdapters;
};

type SlackCandidate = {
  id: string;
  accessToken: string | null;
  botUserId: string | null;
  emailAccountId: string;
  channelId: string | null;
};

type LinkedProviderCandidate = {
  emailAccountId: string;
};

type ResolvedMessagingContext = {
  chatId: string;
  emailAccountId: string;
  messageText: string;
  provider: SupportedPlatform;
  threadLogContext: Record<string, unknown>;
};

type LinkedProviderIdentity = {
  messageText: string;
  providerUserId: string;
  teamId: string;
  teamName: string | null;
};

type TeamsRawActivity = {
  channelData?: {
    team?: {
      name?: string;
    };
    tenant?: {
      id?: string;
    };
  };
  conversation?: {
    id?: string;
  };
};

declare global {
  var inboxZeroMessagingChatSdk: MessagingChatSdkContext | undefined;
}

export function getMessagingChatSdkBot(): MessagingChatSdkContext {
  if (!global.inboxZeroMessagingChatSdk) {
    global.inboxZeroMessagingChatSdk = createMessagingChatSdkBot();
  }

  return global.inboxZeroMessagingChatSdk;
}

export function hasMessagingAdapter(platform: SupportedPlatform): boolean {
  const context = getMessagingChatSdkBot();
  return Boolean(context.adapters[platform]);
}

export function extractSlackTeamIdFromWebhook(
  rawBody: string,
  contentType: string,
): string | null {
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);

    const directTeamId = params.get("team_id");
    if (directTeamId) return directTeamId;

    const payload = params.get("payload");
    if (!payload) return null;

    try {
      const parsed = JSON.parse(payload) as {
        team?: { id?: string };
        team_id?: string;
      };

      return parsed.team?.id ?? parsed.team_id ?? null;
    } catch {
      return null;
    }
  }

  try {
    const parsed = JSON.parse(rawBody) as {
      team_id?: string;
      authorizations?: Array<{ team_id?: string }>;
      event?: { team_id?: string; team?: string };
    };

    return (
      parsed.team_id ??
      parsed.authorizations?.[0]?.team_id ??
      parsed.event?.team_id ??
      parsed.event?.team ??
      null
    );
  } catch {
    return null;
  }
}

export async function ensureSlackTeamInstallation(
  teamId: string,
  logger: Logger,
): Promise<void> {
  const { bot, adapters } = getMessagingChatSdkBot();
  const slackAdapter = adapters.slack;
  if (!slackAdapter) return;

  await bot.initialize();

  const existing = await slackAdapter.getInstallation(teamId);
  if (existing?.botToken) return;

  const channel = await prisma.messagingChannel.findFirst({
    where: {
      provider: MessagingProvider.SLACK,
      teamId,
      isConnected: true,
      accessToken: { not: null },
    },
    orderBy: {
      updatedAt: "desc",
    },
    select: {
      accessToken: true,
      botUserId: true,
      teamName: true,
    },
  });

  if (!channel?.accessToken) {
    logger.warn("No Slack workspace token available for Chat SDK", { teamId });
    return;
  }

  await slackAdapter.setInstallation(teamId, {
    botToken: channel.accessToken,
    botUserId: channel.botUserId ?? undefined,
    teamName: channel.teamName ?? undefined,
  });
}

export async function syncSlackInstallation({
  teamId,
  teamName,
  accessToken,
  botUserId,
  logger,
}: {
  teamId: string;
  teamName?: string | null;
  accessToken: string;
  botUserId?: string | null;
  logger: Logger;
}): Promise<void> {
  try {
    const { bot, adapters } = getMessagingChatSdkBot();
    const slackAdapter = adapters.slack;
    if (!slackAdapter) return;

    await bot.initialize();

    await slackAdapter.setInstallation(teamId, {
      botToken: accessToken,
      botUserId: botUserId ?? undefined,
      teamName: teamName ?? undefined,
    });
  } catch (error) {
    logger.warn("Failed to sync Slack installation to Chat SDK", {
      teamId,
      error,
    });
  }
}

function createMessagingChatSdkBot(): MessagingChatSdkContext {
  const adapters: Record<string, Adapter> = {};
  const typedAdapters: MessagingAdapters = {};

  if (env.SLACK_SIGNING_SECRET) {
    const slackAdapterConfig: Parameters<typeof createSlackAdapter>[0] = {
      signingSecret: env.SLACK_SIGNING_SECRET,
    };

    if (env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET) {
      slackAdapterConfig.clientId = env.SLACK_CLIENT_ID;
      slackAdapterConfig.clientSecret = env.SLACK_CLIENT_SECRET;
    }

    const slackAdapter = createSlackAdapter(slackAdapterConfig);
    adapters.slack = slackAdapter;
    typedAdapters.slack = slackAdapter;
  }

  if (env.TEAMS_BOT_APP_ID && env.TEAMS_BOT_APP_PASSWORD) {
    const teamsAdapter = createTeamsAdapter({
      appId: env.TEAMS_BOT_APP_ID,
      appPassword: env.TEAMS_BOT_APP_PASSWORD,
      appTenantId: env.TEAMS_BOT_APP_TENANT_ID,
      ...(env.TEAMS_BOT_APP_TYPE ? { appType: env.TEAMS_BOT_APP_TYPE } : {}),
    });

    adapters.teams = teamsAdapter;
    typedAdapters.teams = teamsAdapter;
  }

  if (env.TELEGRAM_BOT_TOKEN) {
    const telegramAdapter = createTelegramAdapter({
      botToken: env.TELEGRAM_BOT_TOKEN,
      secretToken: env.TELEGRAM_BOT_SECRET_TOKEN,
    });

    adapters.telegram = telegramAdapter;
    typedAdapters.telegram = telegramAdapter;
  }

  if (!Object.keys(adapters).length) {
    throw new Error(
      "No messaging adapters configured. Configure Slack, Teams, or Telegram credentials.",
    );
  }

  const bot = new Chat<Record<string, Adapter>>({
    userName: "inboxzero",
    adapters,
    state: createChatStateAdapter(),
    dedupeTtlMs: 10 * 60 * 1000,
    logger: "warn",
  });

  registerMessagingHandlers({ bot, adapters: typedAdapters });

  return { bot, adapters: typedAdapters };
}

function registerMessagingHandlers({
  bot,
  adapters,
}: {
  bot: Chat<Record<string, Adapter>>;
  adapters: MessagingAdapters;
}) {
  const logger = createScopedLogger("messaging-chat-sdk");

  bot.onNewMention(async (thread, message) => {
    const handled = await processMessagingAssistantMessage({
      adapters,
      thread,
      message,
      logger,
    });

    if (handled) {
      try {
        await thread.subscribe();
      } catch (error) {
        logger.warn("Failed to subscribe messaging thread", {
          provider: thread.adapter.name,
          threadId: thread.id,
          error,
        });
      }
    }
  });

  bot.onNewMessage(/[\s\S]+/, async (thread, message) => {
    if (!thread.isDM) return;

    const handled = await processMessagingAssistantMessage({
      adapters,
      thread,
      message,
      logger,
    });

    if (handled) {
      try {
        await thread.subscribe();
      } catch (error) {
        logger.warn("Failed to subscribe messaging thread", {
          provider: thread.adapter.name,
          threadId: thread.id,
          error,
        });
      }
    }
  });

  bot.onSubscribedMessage(async (thread, message) => {
    await processMessagingAssistantMessage({
      adapters,
      thread,
      message,
      logger,
    });
  });

  if (adapters.slack) {
    bot.onAssistantThreadStarted(async ({ channelId, threadTs }) => {
      try {
        await adapters.slack?.setSuggestedPrompts(
          channelId,
          threadTs,
          SLACK_ASSISTANT_SUGGESTED_PROMPTS,
          "Try asking Inbox Zero",
        );
      } catch (error) {
        logger.warn("Failed to set Slack assistant suggested prompts", {
          error,
        });
      }
    });
  }
}

async function processMessagingAssistantMessage({
  adapters,
  thread,
  message,
  logger,
}: {
  adapters: MessagingAdapters;
  thread: Thread;
  message: Message;
  logger: Logger;
}): Promise<boolean> {
  const linkCommandHandled = await handleMessagingLinkCommand({
    thread,
    message,
    logger,
  });
  if (linkCommandHandled) return true;

  const context = await resolveMessagingContext({
    adapters,
    thread,
    message,
    logger,
  });

  if (!context) return false;

  const emailAccountUser = await getEmailAccountWithAi({
    emailAccountId: context.emailAccountId,
  });

  if (!emailAccountUser) {
    logger.error("Email account not found for messaging chat", {
      emailAccountId: context.emailAccountId,
      provider: context.provider,
    });
    return false;
  }

  const chat = await prisma.chat.upsert({
    where: { id: context.chatId },
    create: {
      id: context.chatId,
      emailAccountId: context.emailAccountId,
    },
    update: {},
    select: {
      id: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: MAX_CHAT_CONTEXT_MESSAGES,
      },
    },
  });

  const existingMessages: UIMessage[] = [...chat.messages]
    .reverse()
    .map((chatMessage) => ({
      id: chatMessage.id,
      role: chatMessage.role as UIMessage["role"],
      parts: chatMessage.parts as UIMessage["parts"],
    }));

  const userMessageId = `${context.provider}-${message.id}`;
  const newUserMessage: UIMessage = {
    id: userMessageId,
    role: "user",
    parts: [{ type: "text", text: context.messageText }],
  };

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

  const threadLogger = logger.with({
    provider: context.provider,
    emailAccountId: context.emailAccountId,
    ...context.threadLogContext,
  });

  const inboxStatsPromise = getInboxStatsForChatContext({
    emailAccountId: context.emailAccountId,
    provider: emailAccountUser.account.provider,
    logger: threadLogger,
  });

  const memoriesPromise = getRecentChatMemories({
    emailAccountId: context.emailAccountId,
    logger: threadLogger,
  });

  try {
    try {
      await thread.startTyping(
        context.provider === "slack" ? "Thinking..." : undefined,
      );
    } catch {
      // Ignore typing indicator failures
    }

    const inboxStats = await inboxStatsPromise;
    const result = await aiProcessAssistantChat({
      messages: await convertToModelMessages([
        ...existingMessages,
        newUserMessage,
      ]),
      emailAccountId: context.emailAccountId,
      user: emailAccountUser,
      chatId: chat.id,
      memories: await memoriesPromise,
      inboxStats,
      logger: threadLogger,
    });

    const fullText = await result.text;

    await prisma.chatMessage.create({
      data: {
        chat: { connect: { id: chat.id } },
        role: "assistant",
        parts: [
          { type: "text", text: fullText },
        ] as unknown as Prisma.InputJsonValue,
      },
    });

    await thread.post({ markdown: fullText });
    return true;
  } catch (error) {
    threadLogger.error("AI processing failed for messaging chat", { error });

    try {
      await thread.post(
        "Sorry, I ran into an error processing your message. Please try again.",
      );
    } catch {
      // Ignore fallback post failures
    }

    return true;
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
    logger.warn("Failed to load memories for messaging chat", { error });
    return [];
  }
}

async function handleMessagingLinkCommand({
  thread,
  message,
  logger,
}: {
  thread: Thread;
  message: Message;
  logger: Logger;
}): Promise<boolean> {
  const provider = thread.adapter.name;
  if (provider !== "teams" && provider !== "telegram") return false;

  const code = extractConnectCode(message.text);
  if (!code) return false;

  if (!thread.isDM) {
    await sendDmRequiredMessage({ provider, thread, logger });
    return true;
  }

  const identity =
    provider === "teams"
      ? resolveTeamsIdentity({ thread, message })
      : resolveTelegramIdentity({ message });

  if (!identity) {
    await thread.post(
      "Could not read your messaging identity. Please try again.",
    );
    return true;
  }

  const linkProvider = provider === "teams" ? "TEAMS" : "TELEGRAM";
  const linkedCode = await consumeMessagingLinkCode({
    code,
    provider: linkProvider,
  });

  if (!linkedCode) {
    await thread.post(
      "That connect code is invalid or expired. Generate a new code in Inbox Zero settings and try again.",
    );
    return true;
  }

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: linkedCode.emailAccountId },
    select: { id: true },
  });

  if (!emailAccount) {
    await thread.post(
      "This connect code is no longer valid. Generate a new code in Inbox Zero settings and try again.",
    );
    return true;
  }

  await prisma.messagingChannel.upsert({
    where: {
      emailAccountId_provider_teamId: {
        emailAccountId: emailAccount.id,
        provider: toMessagingProvider(provider),
        teamId: identity.teamId,
      },
    },
    update: {
      teamName: identity.teamName,
      providerUserId: identity.providerUserId,
      isConnected: true,
    },
    create: {
      provider: toMessagingProvider(provider),
      teamId: identity.teamId,
      teamName: identity.teamName,
      providerUserId: identity.providerUserId,
      emailAccountId: emailAccount.id,
      isConnected: true,
    },
  });

  await thread.post(
    `Connected successfully. You can now chat with your Inbox Zero assistant in this ${provider} DM.`,
  );

  return true;
}

function extractConnectCode(text: string): string | null {
  const trimmed = text.trim();
  const match = CONNECT_COMMAND_REGEX.exec(trimmed);
  if (!match) return null;
  return match[1] ?? null;
}

async function resolveMessagingContext({
  adapters,
  thread,
  message,
  logger,
}: {
  adapters: MessagingAdapters;
  thread: Thread;
  message: Message;
  logger: Logger;
}): Promise<ResolvedMessagingContext | null> {
  switch (thread.adapter.name) {
    case "slack":
      return resolveSlackMessagingContext({
        slackAdapter: adapters.slack,
        thread,
        message,
        logger,
      });
    case "teams":
      return resolveLinkedProviderMessagingContext({
        provider: "teams",
        identity: resolveTeamsIdentity({ thread, message }),
        thread,
        logger,
      });
    case "telegram":
      return resolveLinkedProviderMessagingContext({
        provider: "telegram",
        identity: resolveTelegramIdentity({ message }),
        thread,
        logger,
      });
    default:
      return null;
  }
}

async function resolveSlackMessagingContext({
  slackAdapter,
  thread,
  message,
  logger,
}: {
  slackAdapter: SlackAdapter | undefined;
  thread: Thread;
  message: Message;
  logger: Logger;
}): Promise<ResolvedMessagingContext | null> {
  if (!slackAdapter) return null;

  const rawEvent = message.raw as SlackEvent;
  const teamId = rawEvent.team_id ?? rawEvent.team;
  const userId = message.author.userId;

  if (!teamId || !userId) return null;

  const { channel, threadTs } = slackAdapter.decodeThreadId(thread.id);

  const candidates = await prisma.messagingChannel.findMany({
    where: {
      provider: MessagingProvider.SLACK,
      teamId,
      isConnected: true,
      accessToken: { not: null },
      providerUserId: userId,
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
    await sendUnauthorizedMessage({ thread, teamId, logger });
    return null;
  }

  const messagingChannel = await resolveSlackMessagingChannel({
    candidates,
    channel,
    chatThreadTs: threadTs || undefined,
    isDirectMessage: thread.isDM,
    logger,
    teamId,
    thread,
  });

  if (!messagingChannel) return null;

  let messageText = message.text.trim();
  if (rawEvent.type === "app_mention") {
    messageText = stripLeadingSlackMention(messageText);
  }

  if (!messageText) return null;

  return {
    provider: "slack",
    emailAccountId: messagingChannel.emailAccountId,
    messageText,
    chatId: getSlackChatId({ channel, threadTs: threadTs || undefined }),
    threadLogContext: { teamId, channel },
  };
}

async function resolveLinkedProviderMessagingContext({
  provider,
  identity,
  thread,
  logger,
}: {
  provider: "teams" | "telegram";
  identity: LinkedProviderIdentity | null;
  thread: Thread;
  logger: Logger;
}): Promise<ResolvedMessagingContext | null> {
  if (!identity) return null;

  if (!thread.isDM) {
    await sendDmRequiredMessage({ provider, thread, logger });
    return null;
  }

  const dbProvider = toMessagingProvider(provider);
  const chatId = `${provider}-${normalizeThreadIdForStorage(thread.id)}`;

  const scopedCandidates = await prisma.messagingChannel.findMany({
    where: {
      provider: dbProvider,
      teamId: identity.teamId,
      providerUserId: identity.providerUserId,
      isConnected: true,
    },
    select: {
      emailAccountId: true,
    },
  });

  const candidates =
    scopedCandidates.length > 0
      ? scopedCandidates
      : await prisma.messagingChannel.findMany({
          where: {
            provider: dbProvider,
            providerUserId: identity.providerUserId,
            isConnected: true,
          },
          select: {
            emailAccountId: true,
          },
        });

  if (candidates.length === 0) {
    await sendLinkRequiredMessage({ provider, thread, logger });
    return null;
  }

  const linkedChannel = await resolveLinkedProviderCandidate({
    candidates,
    chatId,
    logger,
    provider,
    teamId: identity.teamId,
  });

  return {
    provider,
    emailAccountId: linkedChannel.emailAccountId,
    messageText: identity.messageText,
    chatId,
    threadLogContext: {
      threadId: thread.id,
      channelId: thread.channelId,
      teamId: identity.teamId,
      providerUserId: identity.providerUserId,
    },
  };
}

function resolveTeamsIdentity({
  thread,
  message,
}: {
  thread: Thread;
  message: Message;
}): LinkedProviderIdentity | null {
  const messageText = message.text.trim();
  if (!messageText) return null;

  const providerUserId = message.author.userId.trim();
  if (!providerUserId) return null;

  const rawEvent = message.raw as TeamsRawActivity;
  const tenantId = rawEvent.channelData?.tenant?.id?.trim();
  const conversationId =
    rawEvent.conversation?.id?.trim() || thread.channelId?.trim();
  const teamId = tenantId || conversationId;

  if (!teamId) return null;

  return {
    messageText,
    providerUserId,
    teamId,
    teamName: rawEvent.channelData?.team?.name ?? null,
  };
}

function resolveTelegramIdentity({
  message,
}: {
  message: Message;
}): LinkedProviderIdentity | null {
  const messageText = message.text.trim();
  if (!messageText) return null;

  const providerUserId = message.author.userId.trim();
  if (!providerUserId) return null;

  const rawMessage = message.raw as TelegramRawMessage;
  if (!rawMessage?.chat?.id) return null;
  const teamId = String(rawMessage.chat.id);

  return {
    messageText,
    providerUserId,
    teamId,
    teamName: getTelegramChatName(rawMessage),
  };
}

function getTelegramChatName(rawMessage: TelegramRawMessage): string | null {
  if (rawMessage.chat.title) return rawMessage.chat.title;
  if (rawMessage.chat.username) return rawMessage.chat.username;

  const fullName = [rawMessage.chat.first_name, rawMessage.chat.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fullName || null;
}

async function resolveLinkedProviderCandidate({
  candidates,
  chatId,
  logger,
  provider,
  teamId,
}: {
  candidates: LinkedProviderCandidate[];
  chatId: string;
  logger: Logger;
  provider: "teams" | "telegram";
  teamId: string;
}): Promise<LinkedProviderCandidate> {
  if (candidates.length === 1) return candidates[0];

  const existingChat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { emailAccountId: true },
  });

  if (existingChat) {
    const existingCandidate = candidates.find(
      (candidate) => candidate.emailAccountId === existingChat.emailAccountId,
    );
    if (existingCandidate) return existingCandidate;
  }

  logger.warn("Multiple linked messaging accounts found; using first match", {
    provider,
    teamId,
    candidateCount: candidates.length,
  });

  return candidates[0];
}

async function resolveSlackMessagingChannel({
  candidates,
  channel,
  chatThreadTs,
  isDirectMessage,
  logger,
  teamId,
  thread,
}: {
  candidates: SlackCandidate[];
  channel: string;
  chatThreadTs: string | undefined;
  isDirectMessage: boolean;
  logger: Logger;
  teamId: string;
  thread: Thread;
}): Promise<SlackCandidate | null> {
  if (!isDirectMessage) {
    const channelMatch = candidates.find(
      (candidate) => candidate.channelId === channel,
    );
    if (channelMatch) return channelMatch;

    await sendUnlinkedChannelMessage({ thread, logger });

    logger.info("No email account assigned to this channel", {
      teamId,
      channel,
    });

    return null;
  }

  if (candidates.length === 1) return candidates[0];

  const existingChat = await prisma.chat.findUnique({
    where: { id: getSlackChatId({ channel, threadTs: chatThreadTs }) },
    select: { emailAccountId: true },
  });

  if (existingChat) {
    const match = candidates.find(
      (candidate) => candidate.emailAccountId === existingChat.emailAccountId,
    );

    if (match) return match;
  }

  logger.warn("Multiple accounts in Slack DM, using first match", {
    teamId,
    candidateCount: candidates.length,
  });

  return candidates[0];
}

async function sendUnauthorizedMessage({
  thread,
  teamId,
  logger,
}: {
  thread: Thread;
  teamId: string;
  logger: Logger;
}): Promise<void> {
  try {
    await thread.post(
      "To use this bot, connect your Inbox Zero account to this workspace from your settings page.",
    );
  } catch (error) {
    logger.error("Failed to send unauthorized messaging message", {
      error,
      teamId,
    });
  }

  logger.info("Unauthorized messaging user attempted bot access", { teamId });
}

async function sendLinkRequiredMessage({
  provider,
  thread,
  logger,
}: {
  provider: "teams" | "telegram";
  thread: Thread;
  logger: Logger;
}): Promise<void> {
  const providerName = provider === "teams" ? "Teams" : "Telegram";

  try {
    await thread.post(
      `Your ${providerName} account is not linked yet. In Inbox Zero settings, generate a ${providerName} connect code and send \`/connect <code>\` in this DM.`,
    );
  } catch (error) {
    logger.error("Failed to send link-required message", {
      provider,
      error,
    });
  }
}

async function sendDmRequiredMessage({
  provider,
  thread,
  logger,
}: {
  provider: "teams" | "telegram";
  thread: Thread;
  logger: Logger;
}): Promise<void> {
  const providerName = provider === "teams" ? "Teams" : "Telegram";

  try {
    await thread.post(
      `For privacy, ${providerName} support only works in direct messages. Open a DM with the bot and try again.`,
    );
  } catch (error) {
    logger.error("Failed to send DM-required message", {
      provider,
      error,
    });
  }
}

async function sendUnlinkedChannelMessage({
  thread,
  logger,
}: {
  thread: Thread;
  logger: Logger;
}): Promise<void> {
  try {
    await thread.post(
      "This channel isn't linked to an email account. Set one up in your Inbox Zero settings.",
    );
  } catch (error) {
    logger.error("Failed to send unlinked channel message", { error });
  }
}

function createChatStateAdapter() {
  // Chat SDK state relies on short-lived dedupe keys and distributed locks.
  // Redis handles this efficiently across replicas; a SQL store would add
  // latency and lock contention in the webhook path.
  if (env.REDIS_URL) {
    return createIoRedisState({
      url: env.REDIS_URL,
      keyPrefix: CHAT_SDK_STATE_KEY_PREFIX,
      logger: new ConsoleLogger("warn").child("chat-sdk-state"),
    });
  }

  return createMemoryState();
}

function getSlackChatId({
  channel,
  threadTs,
}: {
  channel: string;
  threadTs?: string;
}): string {
  return threadTs ? `slack-${channel}-${threadTs}` : `slack-${channel}`;
}

function normalizeThreadIdForStorage(threadId: string): string {
  return threadId.replaceAll(":", "-");
}

function stripLeadingSlackMention(text: string): string {
  return text.replace(/^@\S+\s*/, "").trim();
}

function toMessagingProvider(provider: "teams" | "telegram") {
  return provider === "teams"
    ? MessagingProvider.TEAMS
    : MessagingProvider.TELEGRAM;
}
