import type { SlackAdapter, SlackEvent } from "@chat-adapter/slack";
import { createIoRedisState } from "@chat-adapter/state-ioredis";
import { createMemoryState } from "@chat-adapter/state-memory";
import type { TelegramRawMessage } from "@chat-adapter/telegram";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import {
  convertToModelMessages,
  readUIMessageStream,
  type UIMessage,
} from "ai";
import {
  Actions,
  Button,
  Card,
  CardText,
  Chat,
  ConsoleLogger,
  type ActionEvent,
  type Adapter,
  type Attachment,
  type CardChild,
  Message,
  type ReactionEvent,
  type Thread,
} from "chat";
import { env } from "@/env";
import type { Prisma } from "@/generated/prisma/client";
import {
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
} from "@/generated/prisma/enums";
import { confirmAssistantEmailActionForAccount } from "@/utils/actions/assistant-chat";
import type { AssistantPendingEmailActionType } from "@/utils/actions/assistant-chat.validation";
import { aiProcessAssistantChat } from "@/utils/ai/assistant/chat";
import { getRecentChatMemories } from "@/utils/ai/assistant/get-recent-chat-memories";
import { getInboxStatsForChatContext } from "@/utils/ai/assistant/get-inbox-stats-for-chat-context";
import {
  mergeSeenRulesRevision,
  saveLastSeenRulesRevision,
} from "@/utils/ai/assistant/chat-seen-rules-revision";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { consumeMessagingLinkCode } from "@/utils/messaging/chat-sdk/link-code-consume";
import type { MessagingPlatform } from "@/utils/messaging/platforms";
import { buildPendingEmailPreview } from "@/utils/messaging/pending-email-preview";
import { markdownToSlackMrkdwn } from "@/utils/messaging/providers/slack/format";
import {
  escapeTelegramMarkdown,
  markdownToTelegramText,
} from "@/utils/messaging/providers/telegram/format";
import {
  expandPromptCommand,
  getHelpText,
  isHelpCommand,
} from "@/utils/messaging/prompt-commands";
import {
  FOLLOW_UP_REMINDER_ACTION_IDS,
  handleFollowUpReminderAction,
} from "@/utils/follow-up/follow-up-actions";
import {
  handleRuleNotificationAction,
  handleSlackRuleNotificationModalSubmit,
  RULE_NOTIFICATION_ACTION_IDS,
  SLACK_DRAFT_EDIT_MODAL_ID,
} from "@/utils/messaging/rule-notifications";
import {
  getMessagingChannelTargetRouteWhere,
  hasMessagingChannelTargetRoute,
} from "@/utils/messaging/routes";
import {
  getMessagingAdapterRegistry,
  type MessagingAdapters,
} from "@/utils/messaging/chat-sdk/adapters";
import { isDuplicateError } from "@/utils/prisma-helpers";
import prisma from "@/utils/prisma";
import {
  getEmailUrlForMessage,
  getEmailUrlForOptionalMessage,
} from "@/utils/url";
import { getEmailAccountWithAi } from "@/utils/user/get";

const MAX_CHAT_CONTEXT_MESSAGES = 12;
const CHAT_SDK_STATE_KEY_PREFIX = "inbox-zero:chat-sdk";
const CONNECT_COMMAND_REGEX =
  /^\/?connect(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9._-]+)\s*$/i;
const PENDING_EMAIL_CONFIRM_ACTION_ID = "acpe";
const LEGACY_PENDING_EMAIL_CONFIRM_ACTION_ID =
  "assistant_confirm_pending_email";
const AFFIRMATIVE_REACTION_EMOJI_TOKENS = new Set(["👍", "✅", "☑", "✔"]);
const AFFIRMATIVE_REACTION_ALIASES = new Set([
  "+1",
  "thumbsup",
  "thumbs_up",
  "white_check_mark",
  "check",
  "heavy_check_mark",
]);
const NEGATIVE_REACTION_EMOJI_TOKENS = new Set(["👎", "❌", "✖", "✕", "☒"]);
const NEGATIVE_REACTION_ALIASES = new Set([
  "-1",
  "thumbsdown",
  "thumbs_down",
  "x",
  "negative_squared_cross_mark",
  "heavy_multiplication_x",
]);
const UNSUPPORTED_MESSAGING_ATTACHMENT_MESSAGE =
  "I can process images, but I can't access or email other file types (documents, videos, audio) sent here yet. Share the contents as text if you want me to draft an email about them.";
const UNSUPPORTED_MESSAGING_ATTACHMENT_MODEL_CONTEXT =
  "Hidden context: The latest messaging input included one or more unsupported non-image file attachments. Their contents are unavailable, and they cannot be attached to outgoing emails from chat.";

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

type SupportedPlatform = MessagingPlatform;
type MessagingThread = Thread<unknown, unknown>;

type MessagingChatSdkContext = {
  bot: Chat<Record<string, Adapter>>;
  adapters: MessagingAdapters;
};

type SlackCandidate = {
  id: string;
  accessToken: string | null;
  botUserId: string | null;
  emailAccountId: string;
  routes: Array<{
    targetId: string;
    targetType: MessagingRouteTargetType;
  }>;
};

type LinkedProviderCandidate = {
  emailAccountId: string;
};

type ImagePart = {
  type: "file";
  url: string;
  mediaType: string;
  filename: string;
};

type ResolvedMessagingContext = {
  chatId: string;
  emailAccountId: string;
  hasMultipleAccounts: boolean;
  hasUnsupportedAttachments: boolean;
  imageParts: ImagePart[];
  messageText: string;
  provider: SupportedPlatform;
  threadLogContext: Record<string, unknown>;
};

type LinkedProviderIdentity = {
  hasUnsupportedAttachments: boolean;
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

type PendingEmailToolPart = {
  type: "tool-sendEmail" | "tool-replyEmail" | "tool-forwardEmail";
  state: "output-available";
  toolCallId: string;
  output?: {
    confirmationState?: string;
    pendingAction?: {
      to?: string;
      subject?: string;
      messageHtml?: string | null;
      content?: string | null;
    };
    reference?: {
      from?: string | null;
      subject?: string | null;
    };
  };
};

type LegacyPendingEmailActionPayload = {
  actionType: AssistantPendingEmailActionType;
  chatId: string;
  chatMessageId: string;
  toolCallId: string;
};

type PendingEmailActionResolution = {
  actionType: AssistantPendingEmailActionType;
  chatMessageId: string;
  toolCallId: string;
};

type ParsedPendingEmailActionValue =
  | { kind: "legacy"; payload: LegacyPendingEmailActionPayload }
  | { kind: "token"; token: string };

type SlackActionRawPayload = {
  team?: { id?: string };
};

declare global {
  var inboxZeroMessagingChatSdk: MessagingChatSdkContext | undefined;
}

const messagingRequestLoggerStore = new AsyncLocalStorage<Logger>();

export function getMessagingChatSdkBot(): MessagingChatSdkContext {
  if (!global.inboxZeroMessagingChatSdk) {
    global.inboxZeroMessagingChatSdk = createMessagingChatSdkBot();
  }

  return global.inboxZeroMessagingChatSdk;
}

export function withMessagingRequestLogger<T>({
  logger,
  fn,
}: {
  logger: Logger;
  fn: () => Promise<T>;
}): Promise<T> {
  return messagingRequestLoggerStore.run(logger, fn);
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
  const { adapters, typedAdapters } = getMessagingAdapterRegistry();

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
  const getHandlerLogger = () =>
    messagingRequestLoggerStore.getStore() ?? logger;

  bot.onNewMention(async (thread, message) => {
    const handlerLogger = getHandlerLogger();
    const handled = await processMessagingAssistantMessage({
      adapters,
      thread,
      message,
      logger: handlerLogger,
    });

    if (handled) {
      await subscribeMessagingThreadSafely({ thread, logger: handlerLogger });
    }
  });

  bot.onNewMessage(/[\s\S]+/, async (thread, message) => {
    if (!thread.isDM) return;

    const handlerLogger = getHandlerLogger();
    const handled = await processMessagingAssistantMessage({
      adapters,
      thread,
      message,
      logger: handlerLogger,
    });

    if (handled) {
      await subscribeMessagingThreadSafely({ thread, logger: handlerLogger });
    }
  });

  bot.onSubscribedMessage(async (thread, message) => {
    const handlerLogger = getHandlerLogger();
    await processMessagingAssistantMessage({
      adapters,
      thread,
      message,
      logger: handlerLogger,
    });
  });

  bot.onReaction(async (event) => {
    if (!event.added) return;
    if (!isAffirmativeReactionEvent(event)) return;

    const provider = getSupportedPlatform(event.thread.adapter.name);
    if (!provider) return;

    const handlerLogger = getHandlerLogger();
    const handled = await processMessagingAssistantMessage({
      adapters,
      thread: event.thread,
      message: buildAffirmativeReactionMessage({ event }),
      logger: handlerLogger,
    });

    if (handled) {
      await subscribeMessagingThreadSafely({
        thread: event.thread,
        logger: handlerLogger,
      });
    }
  });

  bot.onAction(
    [PENDING_EMAIL_CONFIRM_ACTION_ID, LEGACY_PENDING_EMAIL_CONFIRM_ACTION_ID],
    async (event) => {
      const handlerLogger = getHandlerLogger();
      await handlePendingEmailConfirmAction({ event, logger: handlerLogger });
    },
  );

  bot.onAction([...RULE_NOTIFICATION_ACTION_IDS], async (event) => {
    const handlerLogger = getHandlerLogger();
    await handleRuleNotificationAction({
      event,
      logger: handlerLogger,
    });
  });

  bot.onAction([...FOLLOW_UP_REMINDER_ACTION_IDS], async (event) => {
    const handlerLogger = getHandlerLogger();
    await handleFollowUpReminderAction({
      event,
      logger: handlerLogger,
    });
  });

  bot.onModalSubmit(SLACK_DRAFT_EDIT_MODAL_ID, async (event) => {
    const handlerLogger = getHandlerLogger();
    return handleSlackRuleNotificationModalSubmit({
      event,
      logger: handlerLogger,
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

async function subscribeMessagingThreadSafely({
  thread,
  logger,
}: {
  thread: MessagingThread;
  logger: Logger;
}) {
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

async function processMessagingAssistantMessage({
  adapters,
  thread,
  message,
  logger,
}: {
  adapters: MessagingAdapters;
  thread: MessagingThread;
  message: Message;
  logger: Logger;
}): Promise<boolean> {
  const linkCommandHandled = await handleMessagingLinkCommand({
    thread,
    message,
    logger,
  });
  if (linkCommandHandled) return true;

  const switchCommandHandled = await handleSwitchCommand({
    thread,
    message,
    logger,
  });
  if (switchCommandHandled) return true;

  const helpCommandHandled = await handleHelpCommand({
    thread,
    message,
    logger,
  });
  if (helpCommandHandled) return true;

  const clearProcessingReaction = await startSlackProcessingReaction({
    adapters,
    thread,
    message,
    logger,
  });
  try {
    const context = await resolveMessagingContext({
      adapters,
      thread,
      message,
      logger,
    });

    if (!context) return false;

    if (context.hasUnsupportedAttachments) {
      try {
        await thread.post(
          getMessagingAssistantPostPayload({
            provider: context.provider,
            text: UNSUPPORTED_MESSAGING_ATTACHMENT_MESSAGE,
          }),
        );
      } catch (error) {
        logger.warn("Failed to post unsupported attachment guidance", {
          provider: context.provider,
          error,
        });
      }

      if (!context.messageText && context.imageParts.length === 0) {
        return true;
      }
    }

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
        lastSeenRulesRevision: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: MAX_CHAT_CONTEXT_MESSAGES,
        },
        compactions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true },
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
    const userParts: UIMessage["parts"] = [
      ...context.imageParts,
      ...(context.messageText
        ? [{ type: "text" as const, text: context.messageText }]
        : []),
    ];
    const newUserMessage: UIMessage = {
      id: userMessageId,
      role: "user",
      parts: userParts,
    };
    const modelUserMessage: UIMessage = context.hasUnsupportedAttachments
      ? {
          ...newUserMessage,
          parts: [
            {
              type: "text" as const,
              text: UNSUPPORTED_MESSAGING_ATTACHMENT_MODEL_CONTEXT,
            },
            ...newUserMessage.parts,
          ],
        }
      : newUserMessage;

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

    const assistantMessageId = `${userMessageId}-assistant`;
    const existingAssistantMessage = await prisma.chatMessage.findUnique({
      where: { id: assistantMessageId },
      select: { id: true },
    });
    if (existingAssistantMessage) return true;

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
      logContext: "messaging chat",
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
      let seenRulesRevision: number | null = null;
      const result = await aiProcessAssistantChat({
        messages: await convertToModelMessages([
          ...existingMessages,
          modelUserMessage,
        ]),
        emailAccountId: context.emailAccountId,
        user: emailAccountUser,
        chatId: chat.id,
        chatLastSeenRulesRevision: chat.lastSeenRulesRevision,
        chatHasHistory:
          existingMessages.length > 0 || chat.compactions.length > 0,
        memories: await memoriesPromise,
        inboxStats,
        responseSurface: "messaging",
        messagingPlatform: context.provider,
        onRulesStateExposed: (rulesRevision) => {
          seenRulesRevision = mergeSeenRulesRevision(
            seenRulesRevision,
            rulesRevision,
          );
        },
        logger: threadLogger,
      });

      const assistantUiMessage = await collectAssistantUiMessage({
        result,
        originalMessages: [...existingMessages, newUserMessage],
        assistantMessageId,
      });

      if (!assistantUiMessage) {
        throw new Error(
          "Missing assistant message in messaging response stream",
        );
      }

      const fullText = prependAccountIndicator({
        text: normalizeMessagingAssistantText({
          text: getUiMessageText(assistantUiMessage),
        }),
        email: emailAccountUser.email,
        hasMultipleAccounts: context.hasMultipleAccounts,
      });
      const pendingToolPart = getPendingEmailToolPart(
        assistantUiMessage.parts || [],
      );

      try {
        await prisma.chatMessage.create({
          data: {
            id: assistantMessageId,
            chat: { connect: { id: chat.id } },
            role: "assistant",
            parts: (assistantUiMessage.parts || []) as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (isDuplicateError(error, "id")) {
          threadLogger.info(
            "Skipping duplicate messaging assistant response for retried event",
            { assistantMessageId },
          );
          return true;
        }
        throw error;
      }

      if (seenRulesRevision != null) {
        await saveLastSeenRulesRevision({
          chatId: chat.id,
          rulesRevision: seenRulesRevision,
          logger: threadLogger,
        });
      }

      if (pendingToolPart) {
        const postedCard = await postPendingEmailCard({
          thread,
          chatMessageId: assistantMessageId,
          part: pendingToolPart,
          provider: context.provider,
          logger: threadLogger,
        });

        if (!postedCard) {
          const fallbackText = buildPendingEmailCardFallbackText(fullText);
          await thread.post(
            getMessagingAssistantPostPayload({
              provider: context.provider,
              text: fallbackText,
            }),
          );
        }
      } else {
        await thread.post(
          getMessagingAssistantPostPayload({
            provider: context.provider,
            text: fullText,
          }),
        );
      }

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
  } finally {
    if (clearProcessingReaction) {
      await clearProcessingReaction();
    }
  }
}

async function handlePendingEmailConfirmAction({
  event,
  logger,
}: {
  event: ActionEvent;
  logger: Logger;
}) {
  const thread = event.thread;
  if (!thread) {
    logger.warn("Missing thread for pending email confirmation action");
    return;
  }

  const provider = getSupportedPlatform(thread.adapter.name);
  if (!provider) return;

  const parsedAction = parsePendingEmailActionValue(event.value);
  const chatId = getMessagingChatIdForThread({
    provider,
    thread,
  });
  if (!chatId) {
    await postPendingEmailActionFeedback({
      event,
      provider,
      text: "That action is invalid or expired. Ask me to prepare the email again.",
      logger,
    });
    return;
  }

  if (
    parsedAction?.kind === "legacy" &&
    parsedAction.payload.chatId !== chatId
  ) {
    logger.warn(
      "Messaging action chat mismatch for pending email confirmation",
      {
        provider,
        expectedChatId: chatId,
        payloadChatId: parsedAction.payload.chatId,
      },
    );
    await postPendingEmailActionFeedback({
      event,
      provider,
      text: "This action no longer matches this thread. Ask me to prepare it again.",
      logger,
    });
    return;
  }

  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { emailAccountId: true },
  });
  if (!chat) {
    await postPendingEmailActionFeedback({
      event,
      provider,
      text: "I couldn't find that draft anymore. Ask me to prepare it again.",
      logger,
    });
    return;
  }

  const teamId = getTeamIdFromActionEvent({ provider, event });
  const authorizedChannel = await prisma.messagingChannel.findFirst({
    where: {
      provider: toMessagingProvider(provider),
      emailAccountId: chat.emailAccountId,
      providerUserId: event.user.userId,
      isConnected: true,
      ...(teamId ? { teamId } : {}),
    },
    select: { id: true },
  });
  if (!authorizedChannel) {
    await postPendingEmailActionFeedback({
      event,
      provider,
      text: "You don't have permission to confirm this draft.",
      logger,
    });
    return;
  }

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: chat.emailAccountId },
    select: {
      email: true,
      account: { select: { provider: true } },
    },
  });
  if (!emailAccount?.account?.provider) {
    await postPendingEmailActionFeedback({
      event,
      provider,
      text: "I couldn't access this email account right now. Please try again.",
      logger,
    });
    return;
  }

  const pendingAction =
    parsedAction?.kind === "legacy"
      ? {
          actionType: parsedAction.payload.actionType,
          chatMessageId: parsedAction.payload.chatMessageId,
          toolCallId: parsedAction.payload.toolCallId,
        }
      : await resolvePendingEmailActionFromToken({
          chatId,
          token:
            parsedAction?.kind === "token" ? parsedAction.token : undefined,
        });

  if (!pendingAction) {
    await postPendingEmailActionFeedback({
      event,
      provider,
      text: "That action is invalid or expired. Ask me to prepare the email again.",
      logger,
    });
    return;
  }

  const pendingToolPart = await getPendingEmailToolPartForAction({
    chatId,
    chatMessageId: pendingAction.chatMessageId,
    toolCallId: pendingAction.toolCallId,
  });

  try {
    const confirmation = await confirmAssistantEmailActionForAccount({
      chatId,
      chatMessageId: pendingAction.chatMessageId,
      toolCallId: pendingAction.toolCallId,
      actionType: pendingAction.actionType,
      waitForPersistence: true,
      emailAccountId: chat.emailAccountId,
      provider: emailAccount.account.provider,
      logger,
    });

    const successFeedback = buildPendingEmailSuccessFeedback({
      confirmationResult: confirmation.confirmationResult,
      accountEmail: emailAccount.email,
      accountProvider: emailAccount.account.provider,
    });

    if (
      pendingToolPart &&
      (await replacePendingEmailConfirmationCard({
        accountEmail: emailAccount.email,
        accountProvider: emailAccount.account.provider,
        confirmationResult: confirmation.confirmationResult,
        event,
        logger,
        messagingProvider: provider,
        part: pendingToolPart,
      }))
    ) {
      return;
    }

    await postPendingEmailActionFeedback({
      event,
      provider,
      text: successFeedback,
      logger,
    });
  } catch (error) {
    logger.warn("Messaging pending email confirmation failed", {
      provider,
      actionType: pendingAction.actionType,
      error,
    });
    await postPendingEmailActionFeedback({
      event,
      provider,
      text: "I couldn't send that draft. Please try again.",
      logger,
    });
  }
}

async function postPendingEmailCard({
  thread,
  chatMessageId,
  part,
  provider,
  logger,
}: {
  thread: MessagingThread;
  chatMessageId: string;
  part: PendingEmailToolPart;
  provider: SupportedPlatform;
  logger: Logger;
}): Promise<boolean> {
  const actionType = pendingActionTypeFromToolPartType(part.type);

  try {
    await thread.post(
      buildPendingEmailConfirmationCard({
        chatMessageId,
        part,
        provider,
      }),
    );
    return true;
  } catch (error) {
    logger.warn("Failed to post messaging pending email confirmation card", {
      error,
      provider,
      actionType,
    });
    return false;
  }
}

export function buildPendingEmailConfirmationCard({
  chatMessageId,
  part,
  provider,
}: {
  chatMessageId: string;
  part: PendingEmailToolPart;
  provider: SupportedPlatform;
}) {
  const actionType = pendingActionTypeFromToolPartType(part.type);
  const value = createPendingEmailActionToken({
    actionType,
    chatMessageId,
    toolCallId: part.toolCallId,
  });

  const subject = part.output?.pendingAction?.subject?.trim();
  const to = part.output?.pendingAction?.to?.trim();
  const referenceFrom = part.output?.reference?.from?.trim() || undefined;
  const referenceSubject = part.output?.reference?.subject?.trim() || undefined;
  const summary = buildPendingEmailSummary({
    actionType,
    to,
    subject,
    referenceFrom,
    referenceSubject,
  });
  const preview = buildPendingEmailPreview(part);

  const cardChildren: CardChild[] = [
    CardText(getMessagingCardText({ provider, text: summary })),
  ];
  if (preview) {
    cardChildren.push(
      CardText(getMessagingCardText({ provider, text: preview })),
    );
  }
  cardChildren.push(
    Actions([
      Button({
        id: PENDING_EMAIL_CONFIRM_ACTION_ID,
        label: "Send",
        style: "primary",
        value,
      }),
    ]),
  );

  return Card({
    title: "Review draft",
    children: cardChildren,
  });
}

async function replacePendingEmailConfirmationCard({
  accountEmail,
  accountProvider,
  confirmationResult,
  event,
  logger,
  messagingProvider,
  part,
}: {
  accountEmail?: string | null;
  accountProvider?: string | null;
  confirmationResult?: {
    messageId?: string | null;
    threadId?: string | null;
  } | null;
  event: ActionEvent;
  logger: Logger;
  messagingProvider: SupportedPlatform;
  part: PendingEmailToolPart;
}) {
  try {
    await event.adapter.editMessage(
      event.threadId,
      event.messageId,
      buildHandledPendingEmailCard({
        accountEmail,
        accountProvider,
        confirmationResult,
        messagingProvider,
        part,
      }),
    );
    return true;
  } catch (error) {
    logger.warn("Failed to replace messaging pending email confirmation card", {
      error,
    });
    return false;
  }
}

async function collectAssistantUiMessage({
  result,
  originalMessages,
  assistantMessageId,
}: {
  result: Awaited<ReturnType<typeof aiProcessAssistantChat>>;
  originalMessages: UIMessage[];
  assistantMessageId: string;
}) {
  const stream = result.toUIMessageStream<UIMessage>({
    originalMessages,
    generateMessageId: () => assistantMessageId,
  });

  let assistantMessage: UIMessage | null = null;
  for await (const message of readUIMessageStream<UIMessage>({ stream })) {
    if (message.role === "assistant") assistantMessage = message;
  }

  return assistantMessage;
}

function getUiMessageText(message: UIMessage): string {
  const text = (message.parts || [])
    .flatMap((part) =>
      part.type === "text" && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\n")
    .trim();

  return text || "Done.";
}

function getPendingEmailToolPart(
  parts: unknown[],
): PendingEmailToolPart | null {
  return getPendingEmailToolParts(parts)[0] ?? null;
}

function getPendingEmailToolParts(parts: unknown[]): PendingEmailToolPart[] {
  const pendingParts: PendingEmailToolPart[] = [];

  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index] as PendingEmailToolPart | undefined;
    if (!part || part.state !== "output-available") continue;
    if (
      part.type !== "tool-sendEmail" &&
      part.type !== "tool-replyEmail" &&
      part.type !== "tool-forwardEmail"
    ) {
      continue;
    }
    if (part.output?.confirmationState !== "pending") continue;
    if (!part.toolCallId) continue;

    pendingParts.push(part);
  }

  return pendingParts;
}

function pendingActionTypeFromToolPartType(
  type: PendingEmailToolPart["type"],
): AssistantPendingEmailActionType {
  switch (type) {
    case "tool-sendEmail":
      return "send_email";
    case "tool-replyEmail":
      return "reply_email";
    default:
      return "forward_email";
  }
}

export function buildPendingEmailSummary({
  actionType,
  to,
  subject,
  referenceFrom,
  referenceSubject,
}: {
  actionType: AssistantPendingEmailActionType;
  to?: string;
  subject?: string;
  referenceFrom?: string;
  referenceSubject?: string;
}) {
  if (actionType === "send_email") {
    if (to && subject) return `New email to ${to}: "${subject}".`;
    if (to) return `New email to ${to}.`;
    if (subject) return `New email: "${subject}".`;
    return "Review this email.";
  }

  if (actionType === "reply_email") {
    if (referenceFrom && referenceSubject) {
      return `Reply to ${referenceFrom} about "${referenceSubject}".`;
    }
    if (referenceFrom) return `Reply to ${referenceFrom}.`;
    if (referenceSubject) return `Reply about "${referenceSubject}".`;
    return "Review this reply.";
  }

  if (to && referenceFrom && referenceSubject) {
    return `Forward "${referenceSubject}" from ${referenceFrom} to ${to}.`;
  }
  if (to && referenceSubject) return `Forward "${referenceSubject}" to ${to}.`;
  if (to && referenceFrom)
    return `Forward email from ${referenceFrom} to ${to}.`;
  if (to) return `Forward to ${to}.`;
  if (referenceFrom && referenceSubject) {
    return `Forward "${referenceSubject}" from ${referenceFrom}.`;
  }
  if (referenceSubject) return `Forward "${referenceSubject}".`;
  if (referenceFrom) return `Forward email from ${referenceFrom}.`;
  return "Review this forward.";
}

function buildPendingEmailSuccessFeedback({
  confirmationResult,
  accountEmail,
  accountProvider,
}: {
  confirmationResult?: {
    messageId?: string | null;
    threadId?: string | null;
  } | null;
  accountEmail?: string | null;
  accountProvider?: string | null;
}) {
  const emailUrl = getEmailUrlForOptionalMessage({
    messageId: confirmationResult?.messageId,
    threadId: confirmationResult?.threadId,
    emailAddress: accountEmail,
    provider: accountProvider || undefined,
  });
  if (!emailUrl) return "Sent.";

  return `Sent. Open message: ${emailUrl}`;
}

function buildHandledPendingEmailCard({
  accountEmail,
  accountProvider,
  confirmationResult,
  messagingProvider,
  part,
}: {
  accountEmail?: string | null;
  accountProvider?: string | null;
  confirmationResult?: {
    messageId?: string | null;
    threadId?: string | null;
  } | null;
  messagingProvider: SupportedPlatform;
  part: PendingEmailToolPart;
}) {
  const actionType = pendingActionTypeFromToolPartType(part.type);
  const subject = part.output?.pendingAction?.subject?.trim();
  const to = part.output?.pendingAction?.to?.trim();
  const referenceFrom = part.output?.reference?.from?.trim() || undefined;
  const referenceSubject = part.output?.reference?.subject?.trim() || undefined;
  const summary = buildPendingEmailSummary({
    actionType,
    to,
    subject,
    referenceFrom,
    referenceSubject,
  });
  const preview = buildPendingEmailPreview(part);
  const children: CardChild[] = [
    CardText(
      getMessagingCardText({ provider: messagingProvider, text: summary }),
    ),
  ];

  if (preview) {
    children.push(
      CardText(
        getMessagingCardText({ provider: messagingProvider, text: preview }),
      ),
    );
  }

  children.push(
    CardText(
      getMessagingCardText({
        provider: messagingProvider,
        text: `Status: ${getPendingEmailHandledStatus(actionType)}`,
      }),
    ),
  );

  const openText = getPendingEmailHandledOpenText({
    accountEmail,
    accountProvider,
    confirmationResult,
  });
  if (openText) {
    children.push(
      CardText(
        getMessagingCardText({ provider: messagingProvider, text: openText }),
      ),
    );
  }

  return Card({
    title: getPendingEmailHandledTitle(actionType),
    children,
  });
}

export function getPendingEmailHandledTitle(
  actionType: AssistantPendingEmailActionType,
) {
  if (actionType === "send_email") return "Email sent";
  if (actionType === "reply_email") return "Reply sent";
  return "Email forwarded";
}

export function getPendingEmailHandledStatus(
  actionType: AssistantPendingEmailActionType,
) {
  if (actionType === "send_email") return "Email sent.";
  if (actionType === "reply_email") return "Reply sent.";
  return "Email forwarded.";
}

export function getPendingEmailHandledOpenText({
  accountEmail,
  accountProvider,
  confirmationResult,
}: {
  accountEmail?: string | null;
  accountProvider?: string | null;
  confirmationResult?: {
    messageId?: string | null;
    threadId?: string | null;
  } | null;
}) {
  const messageId = confirmationResult?.messageId || undefined;
  const threadId = confirmationResult?.threadId || undefined;
  const resolvedMessageId = messageId || threadId;
  const resolvedThreadId = threadId || messageId;

  if (!resolvedMessageId || !resolvedThreadId) return null;

  const emailUrl = getEmailUrlForMessage(
    resolvedMessageId,
    resolvedThreadId,
    accountEmail,
    accountProvider || undefined,
  );
  const mailbox = accountProvider === "microsoft" ? "Outlook" : "Gmail";

  return `Open in ${mailbox}: ${emailUrl}`;
}

function getMessagingCardText({
  provider,
  text,
}: {
  provider: SupportedPlatform;
  text: string;
}) {
  if (provider !== "telegram") return text;

  return escapeTelegramMarkdown(text);
}

function getSlackTeamIdFromActionRaw(raw: unknown): string | null {
  const teamId =
    (raw as SlackActionRawPayload | null | undefined)?.team?.id ||
    (raw as { team_id?: string } | null | undefined)?.team_id;
  return teamId?.trim() || null;
}

async function postPendingEmailActionFeedback({
  event,
  provider,
  text,
  logger,
}: {
  event: ActionEvent;
  provider: SupportedPlatform;
  text: string;
  logger: Logger;
}) {
  const thread = event.thread;
  if (!thread) {
    logger.warn("Missing thread for messaging action feedback", { provider });
    return;
  }

  if (provider === "slack") {
    try {
      await thread.postEphemeral(event.user, text, {
        fallbackToDM: false,
      });
      return;
    } catch (error) {
      logger.warn("Failed to post Slack ephemeral action feedback", { error });
    }
  }

  try {
    await thread.post(text);
  } catch (error) {
    logger.warn("Failed to post messaging action feedback", {
      provider,
      error,
    });
  }
}

function getSupportedPlatform(adapterName: string): SupportedPlatform | null {
  if (adapterName === "slack") return "slack";
  if (adapterName === "teams") return "teams";
  if (adapterName === "telegram") return "telegram";
  return null;
}

function getMessagingChatIdForThread({
  provider,
  thread,
}: {
  provider: SupportedPlatform;
  thread: { id: string; channelId?: string | null };
}): string | null {
  if (provider === "slack") {
    const slackAdapter = getMessagingChatSdkBot().adapters.slack;
    if (!slackAdapter) return null;
    const { channel, threadTs } = slackAdapter.decodeThreadId(thread.id);
    return getSlackChatId({ channel, threadTs: threadTs || undefined });
  }

  return `${provider}-${normalizeThreadIdForStorage(thread.id)}`;
}

function parsePendingEmailActionValue(
  value: string | undefined,
): ParsedPendingEmailActionValue | null {
  if (!value) return null;

  const legacyPayload = decodeLegacyPendingEmailActionPayload(value);
  if (legacyPayload) {
    return { kind: "legacy", payload: legacyPayload };
  }

  const token = value.trim();
  if (!token || token.length > 64) return null;
  return { kind: "token", token };
}

function decodeLegacyPendingEmailActionPayload(
  value: string,
): LegacyPendingEmailActionPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<LegacyPendingEmailActionPayload>;

    if (!parsed.chatId || !parsed.chatMessageId || !parsed.toolCallId) {
      return null;
    }

    if (
      parsed.actionType !== "send_email" &&
      parsed.actionType !== "reply_email" &&
      parsed.actionType !== "forward_email"
    ) {
      return null;
    }

    return {
      actionType: parsed.actionType,
      chatId: parsed.chatId,
      chatMessageId: parsed.chatMessageId,
      toolCallId: parsed.toolCallId,
    };
  } catch {
    return null;
  }
}

function getTeamIdFromActionEvent({
  provider,
  event,
}: {
  provider: SupportedPlatform;
  event: ActionEvent;
}): string | null {
  if (provider === "slack") return getSlackTeamIdFromActionRaw(event.raw);

  if (provider === "teams") {
    const rawEvent = event.raw as TeamsRawActivity | null | undefined;
    const tenantId = rawEvent?.channelData?.tenant?.id?.trim();
    if (tenantId) return tenantId;

    const conversationId =
      rawEvent?.conversation?.id?.trim() || event.thread?.channelId?.trim();
    return conversationId || null;
  }

  const chatId =
    (event.raw as { message?: { chat?: { id?: number | string } } })?.message
      ?.chat?.id ?? null;
  if (chatId !== null) return String(chatId);

  const telegramAdapter = getMessagingChatSdkBot().adapters.telegram;
  if (!telegramAdapter) return null;
  if (!event.thread) return null;

  try {
    return telegramAdapter.decodeThreadId(event.thread.id).chatId;
  } catch {
    return null;
  }
}

function createPendingEmailActionToken({
  actionType,
  chatMessageId,
  toolCallId,
}: {
  actionType: AssistantPendingEmailActionType;
  chatMessageId: string;
  toolCallId: string;
}): string {
  return createHash("sha256")
    .update(`${actionType}:${chatMessageId}:${toolCallId}`)
    .digest("base64url")
    .slice(0, 16);
}

async function resolvePendingEmailActionFromToken({
  chatId,
  token,
}: {
  chatId: string;
  token: string | undefined;
}): Promise<PendingEmailActionResolution | null> {
  if (!token) return null;

  const chatMessages = await prisma.chatMessage.findMany({
    where: { chatId, role: "assistant" },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      parts: true,
    },
  });

  for (const chatMessage of chatMessages) {
    const parts = Array.isArray(chatMessage.parts)
      ? chatMessage.parts
      : ([] as unknown[]);

    for (const part of getPendingEmailToolParts(parts)) {
      const actionType = pendingActionTypeFromToolPartType(part.type);
      const candidateToken = createPendingEmailActionToken({
        actionType,
        chatMessageId: chatMessage.id,
        toolCallId: part.toolCallId,
      });

      if (candidateToken !== token) continue;

      return {
        actionType,
        chatMessageId: chatMessage.id,
        toolCallId: part.toolCallId,
      };
    }
  }

  return null;
}

async function getPendingEmailToolPartForAction({
  chatId,
  chatMessageId,
  toolCallId,
}: {
  chatId: string;
  chatMessageId: string;
  toolCallId: string;
}): Promise<PendingEmailToolPart | null> {
  const chatMessage = await prisma.chatMessage.findFirst({
    where: { id: chatMessageId, chatId },
    select: { parts: true },
  });

  if (!chatMessage || !Array.isArray(chatMessage.parts)) return null;

  return getEmailToolPartByToolCallId(chatMessage.parts, toolCallId);
}

function getEmailToolPartByToolCallId(
  parts: unknown[],
  toolCallId: string,
): PendingEmailToolPart | null {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index] as PendingEmailToolPart | undefined;
    if (!part || part.state !== "output-available") continue;
    if (part.toolCallId !== toolCallId) continue;
    if (
      part.type !== "tool-sendEmail" &&
      part.type !== "tool-replyEmail" &&
      part.type !== "tool-forwardEmail"
    ) {
      continue;
    }

    return part;
  }

  return null;
}

async function startSlackProcessingReaction({
  adapters,
  thread,
  message,
  logger,
}: {
  adapters: MessagingAdapters;
  thread: MessagingThread;
  message: Message;
  logger: Logger;
}): Promise<(() => Promise<void>) | null> {
  if (thread.adapter.name !== "slack") return null;
  if (message.author.isMe) return null;
  if (!adapters.slack) return null;

  try {
    await adapters.slack.addReaction(thread.id, message.id, "eyes");
    return async () => {
      try {
        await adapters.slack?.removeReaction(thread.id, message.id, "eyes");
      } catch (error) {
        logger.warn("Failed to remove Slack processing reaction", {
          error,
          threadId: thread.id,
          messageId: message.id,
        });
      }
    };
  } catch (error) {
    logger.warn("Failed to add Slack processing reaction", {
      error,
      threadId: thread.id,
      messageId: message.id,
    });
  }

  if (!thread.isDM) return null;

  try {
    const acknowledgementMessage = await thread.post("👀 Working on it...");
    return async () => {
      try {
        await acknowledgementMessage.delete();
      } catch {
        // Best-effort cleanup only.
      }
    };
  } catch (error) {
    logger.warn("Failed to post Slack processing acknowledgement", {
      error,
      threadId: thread.id,
    });
    return null;
  }
}

async function handleMessagingLinkCommand({
  thread,
  message,
  logger,
}: {
  thread: MessagingThread;
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

  const messagingChannel = await prisma.messagingChannel.upsert({
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

  await prisma.messagingRoute.upsert({
    where: {
      messagingChannelId_purpose: {
        messagingChannelId: messagingChannel.id,
        purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
      },
    },
    update: {
      targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      targetId:
        provider === "telegram" ? identity.teamId : identity.providerUserId,
    },
    create: {
      messagingChannelId: messagingChannel.id,
      purpose: MessagingRoutePurpose.RULE_NOTIFICATIONS,
      targetType: MessagingRouteTargetType.DIRECT_MESSAGE,
      targetId:
        provider === "telegram" ? identity.teamId : identity.providerUserId,
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

const SWITCH_COMMAND_REGEX = /^\/switch(?:@[A-Za-z0-9_]+)?(?:\s+(\d+))?\s*$/i;

async function handleSwitchCommand({
  thread,
  message,
  logger,
}: {
  thread: MessagingThread;
  message: Message;
  logger: Logger;
}): Promise<boolean> {
  const provider = thread.adapter.name;
  if (provider !== "teams" && provider !== "telegram") return false;

  const trimmed = message.text.trim();
  const match = SWITCH_COMMAND_REGEX.exec(trimmed);
  if (!match) return false;

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

  const dbProvider = toMessagingProvider(provider);
  const channels = await prisma.messagingChannel.findMany({
    where: {
      provider: dbProvider,
      teamId: identity.teamId,
      providerUserId: identity.providerUserId,
      isConnected: true,
    },
    include: {
      emailAccount: { select: { email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  if (channels.length === 0) {
    await sendLinkRequiredMessage({ provider, thread, logger });
    return true;
  }

  const chatId = getMessagingChatIdForThread({ provider, thread });
  if (!chatId) return false;

  const existingChat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: { emailAccountId: true },
  });

  if (channels.length === 1) {
    const only = channels[0];
    if (only.emailAccountId !== existingChat?.emailAccountId) {
      await prisma.chat.upsert({
        where: { id: chatId },
        update: { emailAccountId: only.emailAccountId },
        create: { id: chatId, emailAccountId: only.emailAccountId },
      });
    }
    await thread.post(`Only one account connected: ${only.emailAccount.email}`);
    return true;
  }

  const arg = match[1];

  if (!arg) {
    const list = channels
      .map((ch, i) => {
        const active =
          ch.emailAccountId === existingChat?.emailAccountId ? " (active)" : "";
        return `${i + 1}. ${ch.emailAccount.email}${active}`;
      })
      .join("\n");

    await thread.post(
      `Your connected accounts:\n${list}\n\nReply with /switch <number> to switch.`,
    );
    return true;
  }

  const index = Number.parseInt(arg, 10) - 1;
  if (Number.isNaN(index) || index < 0 || index >= channels.length) {
    await thread.post("Invalid number. Use /switch to see your options.");
    return true;
  }

  const selected = channels[index];

  if (selected.emailAccountId === existingChat?.emailAccountId) {
    await thread.post(`Already using ${selected.emailAccount.email}.`);
    return true;
  }

  await prisma.chat.upsert({
    where: { id: chatId },
    update: { emailAccountId: selected.emailAccountId },
    create: { id: chatId, emailAccountId: selected.emailAccountId },
  });

  await thread.post(`Switched to ${selected.emailAccount.email}.`);
  return true;
}

async function handleHelpCommand({
  thread,
  message,
  logger,
}: {
  thread: MessagingThread;
  message: Message;
  logger: Logger;
}): Promise<boolean> {
  const provider = thread.adapter.name;
  if (provider !== "telegram" && provider !== "teams") return false;
  if (!isHelpCommand(message.text)) return false;

  if (!thread.isDM) {
    await sendDmRequiredMessage({ provider, thread, logger });
    return true;
  }

  await postMessagingThreadMessage({
    thread,
    logger,
    message: getHelpText(provider),
    errorLogMessage: `Failed to send ${provider} help command response`,
    logMeta: { provider },
  });

  return true;
}

async function resolveMessagingContext({
  adapters,
  thread,
  message,
  logger,
}: {
  adapters: MessagingAdapters;
  thread: MessagingThread;
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
        message,
        thread,
        logger,
      });
    case "telegram":
      return resolveLinkedProviderMessagingContext({
        provider: "telegram",
        identity: resolveTelegramIdentity({ message }),
        message,
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
  thread: MessagingThread;
  message: Message;
  logger: Logger;
}): Promise<ResolvedMessagingContext | null> {
  if (!slackAdapter) return null;

  const rawEvent = message.raw as SlackEvent;
  const teamId = rawEvent.team_id ?? rawEvent.team;
  const userId = message.author.userId;

  if (!userId) return null;

  const { channel, threadTs } = slackAdapter.decodeThreadId(thread.id);

  let candidates = await prisma.messagingChannel.findMany({
    where: {
      provider: MessagingProvider.SLACK,
      isConnected: true,
      accessToken: { not: null },
      providerUserId: userId,
      ...(teamId ? { teamId } : {}),
    },
    select: {
      id: true,
      accessToken: true,
      botUserId: true,
      emailAccountId: true,
      routes: {
        where: getMessagingChannelTargetRouteWhere(channel),
        select: {
          targetType: true,
          targetId: true,
        },
      },
    },
  });

  if (!teamId && !thread.isDM) {
    candidates = candidates.filter((candidate) =>
      hasMessagingChannelTargetRoute(candidate.routes, channel),
    );
  }

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
  messageText = normalizeMessagingUserText({
    text: messageText,
    convertEmojiOnlyResponses: false,
  });

  const hasUnsupportedAttachments = hasUnsupportedMessagingAttachment({
    provider: "slack",
    message,
  });
  const imageParts = await extractImagePartsFromMessage({ message, logger });

  if (!messageText && !hasUnsupportedAttachments && imageParts.length === 0) {
    return null;
  }

  return {
    provider: "slack",
    emailAccountId: messagingChannel.emailAccountId,
    hasMultipleAccounts: false,
    hasUnsupportedAttachments,
    imageParts,
    messageText,
    chatId: getSlackChatId({ channel, threadTs: threadTs || undefined }),
    threadLogContext: { teamId, channel },
  };
}

async function resolveLinkedProviderMessagingContext({
  provider,
  identity,
  message,
  thread,
  logger,
}: {
  provider: "teams" | "telegram";
  identity: LinkedProviderIdentity | null;
  message: Message;
  thread: MessagingThread;
  logger: Logger;
}): Promise<ResolvedMessagingContext | null> {
  if (!identity) return null;
  const hasImageAttachments = message.attachments.some(isImageAttachment);
  if (
    !identity.messageText &&
    !identity.hasUnsupportedAttachments &&
    !hasImageAttachments
  ) {
    return null;
  }

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
    orderBy: { updatedAt: "desc" },
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
          orderBy: { updatedAt: "desc" },
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

  const imageParts = await extractImagePartsFromMessage({ message, logger });

  return {
    provider,
    emailAccountId: linkedChannel.emailAccountId,
    hasMultipleAccounts:
      new Set(candidates.map((c) => c.emailAccountId)).size > 1,
    hasUnsupportedAttachments: identity.hasUnsupportedAttachments,
    imageParts,
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
  thread: MessagingThread;
  message: Message;
}): LinkedProviderIdentity | null {
  const messageText = normalizeMessagingUserText({
    text: expandPromptCommand(message.text.trim()),
  });
  const hasAttachments = message.attachments.length > 0;
  if (!messageText && !hasAttachments) return null;

  const providerUserId = message.author.userId.trim();
  if (!providerUserId) return null;

  const rawEvent = message.raw as TeamsRawActivity;
  const tenantId = rawEvent.channelData?.tenant?.id?.trim();
  const conversationId =
    rawEvent.conversation?.id?.trim() || thread.channelId?.trim();
  const teamId = tenantId || conversationId;

  if (!teamId) return null;

  return {
    hasUnsupportedAttachments: hasAttachments
      ? message.attachments.some((a) => !isImageAttachment(a))
      : false,
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
  const messageText = getTelegramMessageText(message);

  const providerUserId = message.author.userId.trim();
  if (!providerUserId) return null;

  const rawMessage = message.raw as TelegramRawMessage;
  if (!rawMessage?.chat?.id) return null;
  const teamId = String(rawMessage.chat.id);

  return {
    hasUnsupportedAttachments: hasUnsupportedMessagingAttachment({
      provider: "telegram",
      message,
    }),
    messageText,
    providerUserId,
    teamId,
    teamName: getTelegramChatName(rawMessage),
  };
}

function getTelegramMessageText(message: Message): string {
  const plainText = normalizeMessagingUserText({
    text: expandPromptCommand(message.text.trim()),
  });
  if (plainText) return plainText;

  const rawMessage = message.raw as TelegramRawMessage;
  return normalizeMessagingUserText({
    text: expandPromptCommand(rawMessage.caption?.trim() || ""),
  });
}

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function isImageAttachment(attachment: Attachment): boolean {
  if (attachment.type === "image") return true;
  return (
    !!attachment.mimeType && SUPPORTED_IMAGE_MIME_TYPES.has(attachment.mimeType)
  );
}

export function hasUnsupportedMessagingAttachment({
  provider,
  message,
}: {
  provider: "slack" | "telegram";
  message: Pick<Message, "attachments" | "raw">;
}): boolean {
  const hasNonImageChatAttachments = message.attachments.some(
    (a) => !isImageAttachment(a),
  );
  if (hasNonImageChatAttachments) return true;

  if (provider === "slack") {
    const rawEvent = message.raw as SlackEvent;
    const files = rawEvent.files || [];
    return files.some(
      (f: { mimetype?: string }) => !f.mimetype?.startsWith("image/"),
    );
  }

  const rawMessage = message.raw as TelegramRawMessage;
  return Boolean(
    rawMessage.document ||
      rawMessage.video ||
      rawMessage.audio ||
      rawMessage.voice ||
      rawMessage.sticker,
  );
}

async function extractImagePartsFromMessage({
  message,
  logger,
}: {
  message: Pick<Message, "attachments">;
  logger: Logger;
}): Promise<ImagePart[]> {
  const imageAttachments = message.attachments.filter(isImageAttachment);
  if (imageAttachments.length === 0) return [];

  const MAX_IMAGE_ATTACHMENTS = 5;
  const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

  const results: ImagePart[] = [];

  for (const attachment of imageAttachments.slice(0, MAX_IMAGE_ATTACHMENTS)) {
    try {
      let buffer: Buffer | undefined;

      if (attachment.data) {
        buffer = Buffer.isBuffer(attachment.data)
          ? attachment.data
          : Buffer.from(await new Response(attachment.data).arrayBuffer());
      } else if (attachment.fetchData) {
        buffer = await attachment.fetchData();
      } else if (attachment.url) {
        const response = await fetch(attachment.url, {
          signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) continue;
        buffer = Buffer.from(await response.arrayBuffer());
      }

      if (!buffer || buffer.length > MAX_IMAGE_SIZE) continue;

      const mimeType = attachment.mimeType || "image/jpeg";
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${mimeType};base64,${base64}`;

      results.push({
        type: "file",
        url: dataUrl,
        mediaType: mimeType,
        filename: attachment.name || "image",
      });
    } catch (error) {
      logger.warn("Failed to fetch messaging image attachment", {
        name: attachment.name,
        error,
      });
    }
  }

  return results;
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
  return selectCandidateFromExistingChat({
    candidates,
    chatId,
    logger,
    warningMessage:
      "Multiple linked messaging accounts found; using first match",
    warningMeta: { provider, teamId },
  });
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
  teamId?: string | null;
  thread: MessagingThread;
}): Promise<SlackCandidate | null> {
  if (!isDirectMessage) {
    const channelMatch = candidates.find((candidate) =>
      hasMessagingChannelTargetRoute(candidate.routes, channel),
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

  return selectCandidateFromExistingChat({
    candidates,
    chatId: getSlackChatId({ channel, threadTs: chatThreadTs }),
    logger,
    warningMessage: "Multiple accounts in Slack DM, using first match",
    warningMeta: { teamId },
  });
}

async function selectCandidateFromExistingChat<
  TCandidate extends { emailAccountId: string },
>({
  candidates,
  chatId,
  logger,
  warningMessage,
  warningMeta,
}: {
  candidates: TCandidate[];
  chatId: string;
  logger: Logger;
  warningMessage: string;
  warningMeta: Record<string, unknown>;
}): Promise<TCandidate> {
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

  logger.warn(warningMessage, {
    ...warningMeta,
    candidateCount: candidates.length,
  });

  return candidates[0];
}

async function sendUnauthorizedMessage({
  thread,
  teamId,
  logger,
}: {
  thread: MessagingThread;
  teamId?: string | null;
  logger: Logger;
}): Promise<void> {
  await postMessagingThreadMessage({
    thread,
    logger,
    message:
      "To use this bot, connect your Inbox Zero account to this workspace from your settings page.",
    errorLogMessage: "Failed to send unauthorized messaging message",
    logMeta: { teamId },
  });

  logger.info("Unauthorized messaging user attempted bot access", {
    ...(teamId ? { teamId } : {}),
  });
}

async function sendLinkRequiredMessage({
  provider,
  thread,
  logger,
}: {
  provider: "teams" | "telegram";
  thread: MessagingThread;
  logger: Logger;
}): Promise<void> {
  const providerName = provider === "teams" ? "Teams" : "Telegram";

  await postMessagingThreadMessage({
    thread,
    logger,
    message: `Your ${providerName} account is not linked yet. In Inbox Zero settings, generate a ${providerName} connect code and send \`/connect <code>\` in this DM.`,
    errorLogMessage: "Failed to send link-required message",
    logMeta: { provider },
  });
}

async function sendDmRequiredMessage({
  provider,
  thread,
  logger,
}: {
  provider: "teams" | "telegram";
  thread: MessagingThread;
  logger: Logger;
}): Promise<void> {
  const providerName = provider === "teams" ? "Teams" : "Telegram";

  await postMessagingThreadMessage({
    thread,
    logger,
    message: `For privacy, ${providerName} support only works in direct messages. Open a DM with the bot and try again.`,
    errorLogMessage: "Failed to send DM-required message",
    logMeta: { provider },
  });
}

async function sendUnlinkedChannelMessage({
  thread,
  logger,
}: {
  thread: MessagingThread;
  logger: Logger;
}): Promise<void> {
  await postMessagingThreadMessage({
    thread,
    logger,
    message:
      "This channel isn't linked to an email account. Set one up in your Inbox Zero settings.",
    errorLogMessage: "Failed to send unlinked channel message",
  });
}

async function postMessagingThreadMessage({
  thread,
  logger,
  message,
  errorLogMessage,
  logMeta,
}: {
  thread: MessagingThread;
  logger: Logger;
  message: string;
  errorLogMessage: string;
  logMeta?: Record<string, unknown>;
}): Promise<void> {
  try {
    await thread.post(message);
  } catch (error) {
    logger.error(errorLogMessage, {
      ...logMeta,
      error,
    });
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

export function stripLeadingSlackMention(text: string): string {
  return text
    .replace(/^<@[A-Z0-9]+>\s*/i, "")
    .replace(/^@\S+\s*/, "")
    .trim();
}

export function normalizeMessagingAssistantText({ text }: { text: string }) {
  let normalized = text;

  normalized = normalized.replace(
    /(?:you can|please)\s+click [^.]*button[^.]*\./gi,
    "This draft is pending confirmation.",
  );
  normalized = normalized.replace(
    /click (?:the )?(?:confirmation|approve|send) button[^.]*\./gi,
    "This draft is pending confirmation.",
  );

  return normalized;
}

export function buildAffirmativeReactionMessage({
  event,
}: {
  event: ReactionEvent;
}) {
  return new Message({
    id: `reaction:${event.threadId}:${event.messageId}:${event.user.userId}:${event.emoji.name}`,
    threadId: event.threadId,
    text: "yes",
    formatted: {
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "yes" }],
        },
      ],
    },
    raw: event.raw,
    author: event.user,
    metadata: {
      dateSent: new Date(),
      edited: false,
    },
    attachments: [],
    links: [],
  });
}

export function normalizeMessagingUserText({
  text,
  convertEmojiOnlyResponses = true,
}: {
  text: string;
  convertEmojiOnlyResponses?: boolean;
}) {
  const trimmed = text.trim();
  if (!convertEmojiOnlyResponses) return trimmed;

  const emojiResponse = getEmojiOnlyUserResponse(trimmed);

  return emojiResponse ?? trimmed;
}

export function buildPendingEmailCardFallbackText(normalizedText: string) {
  const failureGuidance =
    "I couldn't show the Send button right now. Ask me to prepare the draft again.";

  if (
    normalizedText
      .toLowerCase()
      .includes("i couldn't show the send button right now")
  ) {
    return normalizedText;
  }

  return `${normalizedText}\n\n${failureGuidance}`;
}

function isAffirmativeReactionEvent(event: ReactionEvent) {
  return (
    isAffirmativeReactionToken(event.rawEmoji) ||
    isAffirmativeReactionToken(event.emoji.name)
  );
}

function isAffirmativeReactionToken(token: string) {
  const trimmed = token.trim();
  if (!trimmed) return false;

  if (isAffirmativeReactionAlias(trimmed)) return true;

  return isAffirmativeReactionEmoji(trimmed);
}

function getEmojiOnlyUserResponse(text: string): "yes" | "no" | null {
  if (!text) return null;

  const slackAlias = getSlackEmojiAlias(text);
  if (slackAlias) {
    if (isAffirmativeReactionAlias(slackAlias)) return "yes";
    if (isNegativeReactionAlias(slackAlias)) return "no";
    return null;
  }

  if (isAffirmativeReactionEmoji(text)) return "yes";
  if (isNegativeReactionEmoji(text)) return "no";

  return null;
}

function getSlackEmojiAlias(text: string): string | null {
  const match = /^:([A-Za-z0-9_+-]+):$/.exec(text);
  return match?.[1] ?? null;
}

function isAffirmativeReactionAlias(token: string) {
  return AFFIRMATIVE_REACTION_ALIASES.has(token.trim().toLowerCase());
}

function isNegativeReactionAlias(token: string) {
  return NEGATIVE_REACTION_ALIASES.has(token.trim().toLowerCase());
}

function isAffirmativeReactionEmoji(token: string) {
  return AFFIRMATIVE_REACTION_EMOJI_TOKENS.has(normalizeReactionEmoji(token));
}

function isNegativeReactionEmoji(token: string) {
  return NEGATIVE_REACTION_EMOJI_TOKENS.has(normalizeReactionEmoji(token));
}

function normalizeReactionEmoji(token: string) {
  return token
    .trim()
    .toLowerCase()
    .replaceAll("\uFE0F", "")
    .replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
}

function getMessagingAssistantPostPayload({
  provider,
  text,
}: {
  provider: SupportedPlatform;
  text: string;
}) {
  if (provider === "telegram") {
    return markdownToTelegramText(text);
  }

  if (provider === "slack") {
    return { markdown: markdownToSlackMrkdwn(text) };
  }

  return { markdown: text };
}

function toMessagingProvider(provider: SupportedPlatform) {
  if (provider === "slack") return MessagingProvider.SLACK;
  if (provider === "teams") return MessagingProvider.TEAMS;
  return MessagingProvider.TELEGRAM;
}

function prependAccountIndicator({
  text,
  email,
  hasMultipleAccounts,
}: {
  text: string;
  email: string;
  hasMultipleAccounts: boolean;
}) {
  if (!hasMultipleAccounts) return text;
  return `[${email}]\n${text}`;
}
