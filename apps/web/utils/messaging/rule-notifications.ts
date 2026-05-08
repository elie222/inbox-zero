import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";
import {
  Actions,
  Button,
  Card,
  CardText,
  LinkButton,
  Select,
  SelectOption,
  type ActionEvent,
  type CardElement,
  type CardChild,
  type ModalResponse,
  type ModalSubmitEvent,
} from "chat";
import { cardToBlockKit, cardToFallbackText } from "@chat-adapter/slack";
import prisma from "@/utils/prisma";
import { createSlackClient } from "@/utils/messaging/providers/slack/client";
import {
  disableSlackLinkUnfurls,
  resolveSlackRouteDestination,
} from "@/utils/messaging/providers/slack/send";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";
import {
  escapeSlackText,
  richTextToSlackMrkdwn,
} from "@/utils/messaging/providers/slack/format";
import {
  ActionType,
  AttachmentSourceType,
  MessagingMessageStatus,
  MessagingProvider,
  MessagingRoutePurpose,
  MessagingRouteTargetType,
  SystemType,
} from "@/generated/prisma/enums";
import type { ExecutedRule } from "@/generated/prisma/client";
import type { Logger } from "@/utils/logger";
import {
  convertNewlinesToBr,
  escapeHtml,
  removeExcessiveWhitespace,
  truncate,
} from "@/utils/string";
import { analyzeCalendarEvent } from "@/utils/parse/calender-event";
import { createEmailProvider } from "@/utils/email/provider";
import { getFormattedSenderAddress } from "@/utils/email/get-formatted-sender-address";
import { resolveActionAttachments } from "@/utils/ai/action-attachments";
import { quotePlainTextContent } from "@/utils/email/quoted-plain-text";
import { formatReplySubject } from "@/utils/email/subject";
import { emailToContent } from "@/utils/mail";
import {
  extractDraftPlainText,
  stripQuotedContent,
} from "@/utils/ai/choose-rule/draft-management";
import type { ParsedMessage } from "@/utils/types";
import he from "he";
import { isDraftReplyActionType } from "@/utils/actions/draft-reply";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import {
  isMessagingChannelOperational,
  isOperationalSlackChannel,
} from "@/utils/messaging/channel-validity";
import { getMessagingAdapterRegistry } from "@/utils/messaging/chat-sdk/adapters";
import {
  escapeTelegramMarkdown,
  markdownToTelegramText,
} from "@/utils/messaging/providers/telegram/format";
import { getMessagingRoute } from "@/utils/messaging/routes";
import { getEmailUrlForOptionalMessage } from "@/utils/url";
import {
  attachmentSourceInputSchema,
  selectedAttachmentSchema,
} from "@/utils/attachments/source-schema";

const DRAFT_PREVIEW_MAX_CHARS = 900;
const SUMMARY_PREVIEW_MAX_CHARS = 2000;
const MAX_DRAFT_ATTACHMENT_NAMES = 5;
const RULE_DRAFT_SEND_ACTION_ID = "rule_draft_send";
const RULE_DRAFT_EDIT_ACTION_ID = "rule_draft_edit";
const RULE_DRAFT_DISMISS_ACTION_ID = "rule_draft_dismiss";
const RULE_NOTIFY_ARCHIVE_ACTION_ID = "rule_notify_archive";
const RULE_NOTIFY_MARK_READ_ACTION_ID = "rule_notify_mark_read";
const RULE_NOTIFY_MORE_ACTION_ID = "rule_notify_more";
const RULE_NOTIFY_TRASH_ACTION_ID = "rule_notify_trash";
const RULE_NOTIFY_MARK_SPAM_ACTION_ID = "rule_notify_mark_spam";
export const SLACK_DRAFT_EDIT_MODAL_ID = "rule_draft_edit_modal";
const SLACK_DRAFT_EDIT_FIELD_ID = "draft_content";

export const RULE_NOTIFICATION_ACTION_IDS = [
  RULE_DRAFT_SEND_ACTION_ID,
  RULE_DRAFT_EDIT_ACTION_ID,
  RULE_DRAFT_DISMISS_ACTION_ID,
  RULE_NOTIFY_ARCHIVE_ACTION_ID,
  RULE_NOTIFY_MARK_READ_ACTION_ID,
  RULE_NOTIFY_MORE_ACTION_ID,
  // Keep legacy direct listeners for Slack cards posted before destructive actions moved into More.
  RULE_NOTIFY_TRASH_ACTION_ID,
  RULE_NOTIFY_MARK_SPAM_ACTION_ID,
] as const;

type NotificationContext = NonNullable<
  Awaited<ReturnType<typeof getNotificationContext>>
>;

type NotificationContent = {
  details?: string[];
  summary: string;
  title: string;
};

type NotificationContentFormat = "plain" | "slack";

type NotificationOpenLink = {
  label: string;
  url: string;
};

type NotificationEmailPreview = {
  headers: {
    from: string;
    subject: string;
  };
  snippet: string;
  textPlain?: string;
  textHtml?: string;
  attachments?: Array<{ filename: string }>;
};

export function buildSlackRuleNotificationPreviewBlocks({
  actionId,
  actionType,
  email,
  systemType = null,
  draftContent,
  draftAttachmentNames,
  openLink,
}: {
  actionId: string;
  actionType: ActionType;
  email: NotificationEmailPreview;
  systemType?: SystemType | null;
  draftContent?: string | null;
  draftAttachmentNames?: string[];
  openLink?: NotificationOpenLink | null;
}) {
  const content = buildNotificationContent({
    actionType,
    email,
    systemType,
    draftContent,
    draftAttachmentNames,
    format: "slack",
  });

  return cardToBlockKit(
    buildNotificationCard({
      actionId,
      actionType,
      content,
      openLink,
    }),
  );
}

type MessagingRuleNotificationResult = {
  delivered: boolean;
  kind: "interactive" | "view_only" | "none";
};

export async function sendMessagingRuleNotification({
  executedActionId,
  email,
  logger,
}: {
  executedActionId: string;
  email: NotificationEmailPreview;
  logger: Logger;
}): Promise<boolean> {
  const result = await getMessagingRuleNotificationResult({
    executedActionId,
    email,
    logger,
  });

  return result.delivered;
}

export async function replaceMessagingDraftNotificationsWithHandledOnWebState({
  executedRuleId,
  logger,
}: {
  executedRuleId: string;
  logger: Logger;
}) {
  const notificationActions = await prisma.executedAction.findMany({
    where: {
      executedRuleId,
      type: ActionType.DRAFT_MESSAGING_CHANNEL,
      messagingMessageId: { not: null },
      messagingChannel: {
        isConnected: true,
      },
    },
    select: {
      id: true,
    },
  });

  const results = await Promise.allSettled(
    notificationActions.map(({ id }) =>
      replaceMessagingDraftNotificationWithHandledOnWebState({
        executedActionId: id,
        logger,
      }),
    ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      logger.warn("Failed to collapse one messaging draft notification", {
        executedRuleId,
        error: result.reason,
      });
    }
  }
}

export async function getMessagingRuleNotificationResult({
  executedActionId,
  email,
  logger,
}: {
  executedActionId: string;
  email: NotificationEmailPreview;
  logger: Logger;
}): Promise<MessagingRuleNotificationResult> {
  const context = await getNotificationContext(executedActionId);
  if (!context) return { delivered: false, kind: "none" };

  if (
    context.messagingChannel &&
    context.messagingChannel.emailAccountId !==
      context.executedRule.emailAccount.id
  ) {
    logger.warn(
      "Skipping messaging notification for mismatched channel owner",
      {
        executedActionId: context.id,
        messagingChannelId: context.messagingChannelId,
        emailAccountId: context.executedRule.emailAccount.id,
        channelEmailAccountId: context.messagingChannel.emailAccountId,
      },
    );
    return { delivered: false, kind: "none" };
  }

  if (context.messagingChannel?.provider === MessagingProvider.SLACK) {
    return sendSlackRuleNotificationWithContext({
      context,
      email,
      logger,
    });
  }

  if (
    context.messagingChannel?.provider === MessagingProvider.TELEGRAM &&
    isDraftReplyActionType(context.type)
  ) {
    return sendTelegramRuleNotificationWithContext({
      context,
      email,
      logger,
    });
  }

  return sendLinkedRuleNotification({
    context,
    email,
    logger,
  });
}

async function sendSlackRuleNotificationWithContext({
  context,
  email,
  logger,
}: {
  context: NotificationContext;
  email: NotificationEmailPreview;
  logger: Logger;
}): Promise<MessagingRuleNotificationResult> {
  if (
    !context.messagingChannel ||
    !isOperationalSlackChannel(context.messagingChannel)
  ) {
    logger.warn("Skipping messaging notification with inactive Slack channel", {
      executedActionId: context.id,
      messagingChannelId: context.messagingChannelId,
    });
    return { delivered: false, kind: "none" };
  }

  const route = getMessagingRoute(
    context.messagingChannel.routes,
    MessagingRoutePurpose.RULE_NOTIFICATIONS,
  );

  if (!route) {
    logger.warn("Skipping messaging notification with no Slack route", {
      executedActionId: context.id,
      messagingChannelId: context.messagingChannelId,
    });
    return { delivered: false, kind: "none" };
  }

  const destinationChannelId = await resolveSlackRouteDestination({
    accessToken: context.messagingChannel.accessToken,
    route,
  });

  if (!destinationChannelId) {
    logger.warn("Skipping messaging notification with no Slack destination", {
      executedActionId: context.id,
      messagingChannelId: context.messagingChannelId,
    });
    return { delivered: false, kind: "none" };
  }

  const draftContent = await getNotificationDraftContent({
    context,
    logger,
  });
  const draftAttachmentNames = getNotificationDraftAttachmentNames({
    context,
    logger,
  });

  const content = buildNotificationContent({
    actionType: context.type,
    email,
    systemType: context.executedRule.rule?.systemType ?? null,
    draftContent,
    draftAttachmentNames,
    format: "slack",
  });

  const rootMessageId =
    (await findSlackRootMessageId({
      executedActionId: context.id,
      emailAccountId: context.executedRule.emailAccount.id,
      messagingChannelId: context.messagingChannel.id,
      threadId: context.executedRule.threadId,
    })) ?? null;

  const card = buildNotificationCard({
    actionId: context.id,
    actionType: context.type,
    content,
    openLink: getNotificationOpenLink(context),
  });

  try {
    const responseTs = await postSlackCard({
      accessToken: context.messagingChannel.accessToken,
      card,
      route,
      destinationChannelId,
      rootMessageId,
    });

    await prisma.executedAction.update({
      where: { id: context.id },
      data: {
        messagingMessageId: rootMessageId ?? responseTs ?? null,
        messagingMessageSentAt: new Date(),
        messagingMessageStatus: MessagingMessageStatus.SENT,
      },
    });
    return { delivered: true, kind: "interactive" };
  } catch (error) {
    logger.warn("Failed to send Slack rule notification", {
      executedActionId: context.id,
      error,
    });
    return { delivered: false, kind: "none" };
  }
}

async function sendLinkedRuleNotification({
  context,
  email,
  logger,
}: {
  context: NotificationContext;
  email: NotificationEmailPreview;
  logger: Logger;
}): Promise<MessagingRuleNotificationResult> {
  if (
    !context.messagingChannel ||
    !isMessagingChannelOperational(context.messagingChannel) ||
    (context.messagingChannel.provider !== MessagingProvider.TEAMS &&
      context.messagingChannel.provider !== MessagingProvider.TELEGRAM)
  ) {
    logger.warn(
      "Skipping messaging notification with inactive linked channel",
      {
        executedActionId: context.id,
        messagingChannelId: context.messagingChannelId,
      },
    );
    return { delivered: false, kind: "none" };
  }

  const route = getMessagingRoute(
    context.messagingChannel.routes,
    MessagingRoutePurpose.RULE_NOTIFICATIONS,
  );

  if (!route) {
    logger.warn(
      "Skipping messaging notification with no linked channel route",
      {
        executedActionId: context.id,
        messagingChannelId: context.messagingChannelId,
        provider: context.messagingChannel.provider,
      },
    );
    return { delivered: false, kind: "none" };
  }

  const draftContent = await getNotificationDraftContent({
    context,
    logger,
  });
  const draftAttachmentNames = getNotificationDraftAttachmentNames({
    context,
    logger,
  });

  const content = buildNotificationContent({
    actionType: context.type,
    email,
    systemType: context.executedRule.rule?.systemType ?? null,
    draftContent,
    draftAttachmentNames,
    format: "plain",
  });
  const text = buildMessagingRuleNotificationText({
    actionType: context.type,
    content,
    provider: context.messagingChannel.provider,
  });

  try {
    const response = await sendAutomationMessage({
      channel: context.messagingChannel,
      route,
      text,
      logger,
    });

    await prisma.executedAction.update({
      where: { id: context.id },
      data: {
        messagingMessageId: response.messageId ?? response.channelId ?? null,
        messagingMessageSentAt: new Date(),
        messagingMessageStatus: MessagingMessageStatus.SENT,
      },
    });
    return { delivered: true, kind: "view_only" };
  } catch (error) {
    logger.warn("Failed to send linked messaging rule notification", {
      executedActionId: context.id,
      provider: context.messagingChannel.provider,
      error,
    });
    return { delivered: false, kind: "none" };
  }
}

async function sendTelegramRuleNotificationWithContext({
  context,
  email,
  logger,
}: {
  context: NotificationContext;
  email: NotificationEmailPreview;
  logger: Logger;
}): Promise<MessagingRuleNotificationResult> {
  if (
    !context.messagingChannel?.isConnected ||
    context.messagingChannel.provider !== MessagingProvider.TELEGRAM
  ) {
    logger.warn("Skipping Telegram notification with inactive channel", {
      executedActionId: context.id,
      messagingChannelId: context.messagingChannelId,
    });
    return { delivered: false, kind: "none" };
  }

  const route = getMessagingRoute(
    context.messagingChannel.routes,
    MessagingRoutePurpose.RULE_NOTIFICATIONS,
  );
  const destination = route?.targetId || context.messagingChannel.teamId;

  if (!destination) {
    logger.warn("Skipping Telegram notification with no route destination", {
      executedActionId: context.id,
      messagingChannelId: context.messagingChannelId,
    });
    return { delivered: false, kind: "none" };
  }

  let telegramAdapter: ReturnType<
    typeof getMessagingAdapterRegistry
  >["typedAdapters"]["telegram"];

  try {
    telegramAdapter = getMessagingAdapterRegistry().typedAdapters.telegram;
  } catch {
    telegramAdapter = undefined;
  }

  if (!telegramAdapter) {
    logger.warn("Skipping Telegram notification without adapter", {
      executedActionId: context.id,
      messagingChannelId: context.messagingChannelId,
    });
    return { delivered: false, kind: "none" };
  }

  const draftContent = await getNotificationDraftContent({
    context,
    logger,
  });
  const draftAttachmentNames = getNotificationDraftAttachmentNames({
    context,
    logger,
  });

  const content = buildNotificationContent({
    actionType: context.type,
    email,
    systemType: context.executedRule.rule?.systemType ?? null,
    draftContent,
    draftAttachmentNames,
    format: "plain",
  });

  try {
    const threadId = await telegramAdapter.openDM(destination);
    const response = await telegramAdapter.postMessage(
      threadId,
      buildTelegramNotificationCard({
        actionId: context.id,
        content,
        openLink: getNotificationOpenLink(context),
      }),
    );

    await prisma.executedAction.update({
      where: { id: context.id },
      data: {
        messagingMessageId: response.id ?? threadId,
        messagingMessageSentAt: new Date(),
        messagingMessageStatus: MessagingMessageStatus.SENT,
      },
    });
    return { delivered: true, kind: "interactive" };
  } catch (error) {
    logger.warn("Failed to send Telegram rule notification", {
      executedActionId: context.id,
      error,
    });
    return { delivered: false, kind: "none" };
  }
}

export async function handleRuleNotificationAction({
  event,
  logger,
}: {
  event: ActionEvent;
  logger: Logger;
}) {
  const selection = getRuleNotificationActionSelection(event);
  if (!selection) {
    await postNotificationFeedback({
      event,
      logger,
      text: "That notification is invalid or expired.",
    });
    return;
  }

  const context =
    event.adapter.name === "telegram"
      ? await getAuthorizedTelegramNotificationContext({
          executedActionId: selection.executedActionId,
          logger,
          chatId: getTelegramChatId(event),
          userId: event.user.userId,
          event,
        })
      : await getAuthorizedSlackNotificationContext({
          executedActionId: selection.executedActionId,
          logger,
          teamId: getSlackTeamId(event.raw),
          userId: event.user.userId,
          event,
        });
  if (!context) return;

  switch (selection.actionId) {
    case RULE_DRAFT_SEND_ACTION_ID:
      await handleDraftSend({ context, event, logger });
      return;
    case RULE_DRAFT_EDIT_ACTION_ID:
      if (context.messagingChannel?.provider !== MessagingProvider.SLACK) {
        await postNotificationFeedback({
          event,
          logger,
          text: "Edit isn't available here yet. Reply here with what you want changed instead.",
        });
        return;
      }
      await handleDraftEdit({ context, event, logger });
      return;
    case RULE_DRAFT_DISMISS_ACTION_ID:
      await handleDismissNotification({ context, event, logger });
      return;
    case RULE_NOTIFY_ARCHIVE_ACTION_ID:
      await handleArchiveNotification({ context, event, logger });
      return;
    case RULE_NOTIFY_MARK_READ_ACTION_ID:
      await handleMarkReadNotification({ context, event, logger });
      return;
    case RULE_NOTIFY_TRASH_ACTION_ID:
      await handleTrashNotification({ context, event, logger });
      return;
    case RULE_NOTIFY_MARK_SPAM_ACTION_ID:
      await handleMarkSpamNotification({ context, event, logger });
      return;
    default:
      await postNotificationFeedback({
        event,
        logger,
        text: "That notification action is not supported.",
      });
  }
}

export async function handleSlackRuleNotificationModalSubmit({
  event,
  logger,
}: {
  event: ModalSubmitEvent;
  logger: Logger;
}): Promise<ModalResponse | undefined> {
  const executedActionId = event.privateMetadata?.trim();
  if (!executedActionId) {
    return { action: "close" };
  }

  const context = await getAuthorizedSlackNotificationContext({
    executedActionId,
    logger,
    teamId: getSlackTeamId(event.raw),
    userId: event.user.userId,
  });
  if (!context) {
    return { action: "close" };
  }

  const nextContent = event.values[SLACK_DRAFT_EDIT_FIELD_ID]?.trim() || "";
  if (!nextContent) {
    return {
      action: "errors",
      errors: {
        [SLACK_DRAFT_EDIT_FIELD_ID]: "Draft content is required.",
      },
    };
  }

  if (!canEditDraft(context.messagingMessageStatus)) {
    return { action: "close" };
  }

  const mailboxDraftAction = getMailboxDraftActionForMessagingDraft(context);

  if (mailboxDraftAction?.draftId) {
    try {
      const provider = await createProviderForContext(context, logger);

      await provider.updateDraft(mailboxDraftAction.draftId, {
        messageHtml: convertNewlinesToBr(escapeHtml(nextContent)),
        ...(mailboxDraftAction.subject
          ? { subject: mailboxDraftAction.subject }
          : {}),
      });
    } catch (error) {
      logger.warn("Failed to sync edited Slack draft back to email draft", {
        executedActionId: context.id,
        mailboxDraftActionId: mailboxDraftAction.id,
        error,
      });
      return {
        action: "errors",
        errors: {
          [SLACK_DRAFT_EDIT_FIELD_ID]:
            "I couldn't update that draft. Please try again.",
        },
      };
    }
  }

  await prisma.executedAction.updateMany({
    where: {
      id: {
        in: [context.id, mailboxDraftAction?.id].filter(Boolean) as string[],
      },
    },
    data: {
      content: nextContent,
    },
  });

  try {
    await sendDraftReplyFromNotification({
      context: { ...context, content: nextContent },
      logger,
      editMessage: async (card) => {
        if (event.relatedMessage) {
          await event.relatedMessage.edit(card);
          return;
        }

        logger.warn("Slack draft modal submitted without related message", {
          executedActionId: context.id,
        });
      },
    });
  } catch (error) {
    logger.warn("Failed to send edited Slack draft notification reply", {
      executedActionId: context.id,
      error,
    });
    return {
      action: "errors",
      errors: {
        [SLACK_DRAFT_EDIT_FIELD_ID]:
          "I couldn't send that draft. Please try again.",
      },
    };
  }

  return { action: "close" };
}

function getRuleNotificationActionSelection(event: ActionEvent): {
  actionId: string;
  executedActionId: string;
} | null {
  const value = event.value?.trim();
  if (!value) return null;

  if (event.actionId !== RULE_NOTIFY_MORE_ACTION_ID) {
    if (!isDirectRuleNotificationActionId(event.actionId)) return null;

    return {
      actionId: event.actionId,
      executedActionId: value,
    };
  }

  const separatorIndex = value.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) return null;

  const selectedActionId = value.slice(0, separatorIndex);
  if (
    selectedActionId !== RULE_NOTIFY_TRASH_ACTION_ID &&
    selectedActionId !== RULE_NOTIFY_MARK_SPAM_ACTION_ID
  ) {
    return null;
  }

  return {
    actionId: selectedActionId,
    executedActionId: value.slice(separatorIndex + 1),
  };
}

function isDirectRuleNotificationActionId(actionId: string) {
  return (
    actionId === RULE_DRAFT_SEND_ACTION_ID ||
    actionId === RULE_DRAFT_EDIT_ACTION_ID ||
    actionId === RULE_DRAFT_DISMISS_ACTION_ID ||
    actionId === RULE_NOTIFY_ARCHIVE_ACTION_ID ||
    actionId === RULE_NOTIFY_MARK_READ_ACTION_ID ||
    actionId === RULE_NOTIFY_TRASH_ACTION_ID ||
    actionId === RULE_NOTIFY_MARK_SPAM_ACTION_ID
  );
}

async function handleDraftSend({
  context,
  event,
  logger,
}: {
  context: NotificationContext;
  event: ActionEvent;
  logger: Logger;
}) {
  if (!canSendDraft(context.messagingMessageStatus)) {
    await postNotificationFeedback({
      event,
      logger,
      text: "That draft has already been handled.",
    });
    return;
  }

  try {
    const result = await sendDraftReplyFromNotification({
      context,
      logger,
      editMessage: async (card) => {
        await event.adapter.editMessage(event.threadId, event.messageId, card);
      },
    });

    if (result === "draft_unavailable") {
      await postNotificationFeedback({
        event,
        logger,
        text: "This draft is no longer available.",
      });
    }
  } catch (error) {
    logger.warn("Failed to send Slack draft notification reply", {
      executedActionId: context.id,
      error,
    });
    await postNotificationFeedback({
      event,
      logger,
      text: "I couldn't send that draft. Please try again.",
    });
  }
}

async function sendDraftReplyFromNotification({
  context,
  logger,
  editMessage,
}: {
  context: NotificationContext;
  logger: Logger;
  editMessage: (card: CardElement) => Promise<void>;
}): Promise<"sent" | "draft_unavailable"> {
  const provider = await createProviderForContext(context, logger);

  const mailboxDraftAction = getMailboxDraftActionForMessagingDraft(context);
  const finalDraftContent = await getEditableDraftContent({
    context,
    provider,
    mailboxDraftAction,
  });
  const sourceMessageSummary = await getSourceMessageSummaryForProvider({
    context,
    provider,
  });
  const draftAttachmentNames = getNotificationDraftAttachmentNames({
    context,
    logger,
  });
  const notificationContent = buildNotificationContent({
    actionType: context.type,
    email: sourceMessageSummary,
    systemType: context.executedRule.rule?.systemType ?? null,
    draftContent: finalDraftContent,
    draftAttachmentNames,
    format:
      context.messagingChannel?.provider === MessagingProvider.SLACK
        ? "slack"
        : "plain",
  });

  if (mailboxDraftAction?.draftId) {
    await provider.sendDraft(mailboxDraftAction.draftId);
  } else {
    const sourceMessage = await provider.getMessage(
      context.executedRule.messageId,
    );
    const attachments = await resolveActionAttachments({
      email: sourceMessage,
      emailAccount: {
        email: context.executedRule.emailAccount.email,
        id: context.executedRule.emailAccount.id,
        userId: context.executedRule.emailAccount.userId,
      },
      executedRule: {
        id: context.executedRule.id,
        threadId: context.executedRule.threadId,
        emailAccountId: context.executedRule.emailAccount.id,
        ruleId: context.executedRule.ruleId,
      } as ExecutedRule,
      logger,
      staticAttachments: context.staticAttachments,
      selectedAttachments: context.selectedAttachments,
      includeAiSelectedAttachments: true,
    });

    const content = context.content?.trim();
    if (!content) {
      await prisma.executedAction.update({
        where: { id: context.id },
        data: {
          messagingMessageStatus: MessagingMessageStatus.EXPIRED,
        },
      });

      await editMessage(
        buildTerminalCard({
          title: "Draft unavailable",
          message: "This draft is no longer available.",
        }),
      );

      return "draft_unavailable";
    }

    const formattedFrom = await getFormattedSenderAddress({
      emailAccountId: context.executedRule.emailAccount.id,
      fallbackEmail: context.executedRule.emailAccount.email,
    });

    await provider.sendEmailWithHtml(
      buildNotificationReplySendBody({
        sourceMessage,
        fallbackThreadId: context.executedRule.threadId,
        to: context.to,
        cc: context.cc,
        bcc: context.bcc,
        subject: context.subject,
        content,
        formattedFrom,
        attachments: serializeMailAttachments(attachments),
      }),
    );
  }

  await prisma.executedAction.update({
    where: { id: context.id },
    data: {
      messagingMessageStatus: MessagingMessageStatus.DRAFT_SENT,
      wasDraftSent: true,
    },
  });

  if (mailboxDraftAction?.id) {
    await prisma.executedAction.update({
      where: { id: mailboxDraftAction.id },
      data: {
        wasDraftSent: true,
      },
    });
  }

  await editMessage(
    buildHandledNotificationCard({
      content: notificationContent,
      openLink: getNotificationOpenLink(context),
      status: "Reply sent.",
    }),
  );

  return "sent";
}

export function buildNotificationReplySendBody({
  sourceMessage,
  fallbackThreadId,
  to,
  cc,
  bcc,
  subject,
  content,
  formattedFrom,
  attachments,
}: {
  sourceMessage: Pick<ParsedMessage, "id" | "threadId" | "headers">;
  fallbackThreadId: string;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
  subject?: string | null;
  content: string;
  formattedFrom?: string | null;
  attachments: Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}) {
  return {
    replyToEmail: {
      threadId: sourceMessage.threadId || fallbackThreadId,
      headerMessageId: sourceMessage.headers["message-id"] || "",
      references: sourceMessage.headers.references,
      messageId: sourceMessage.id,
    },
    to: to || sourceMessage.headers["reply-to"] || sourceMessage.headers.from,
    cc: cc ?? undefined,
    bcc: bcc ?? undefined,
    subject: subject || formatReplySubject(sourceMessage.headers.subject),
    messageHtml: convertNewlinesToBr(escapeHtml(content)),
    ...(formattedFrom ? { from: formattedFrom } : {}),
    attachments,
  };
}

async function handleDraftEdit({
  context,
  event,
  logger,
}: {
  context: NotificationContext;
  event: ActionEvent;
  logger: Logger;
}) {
  if (!canEditDraft(context.messagingMessageStatus)) {
    await postNotificationFeedback({
      event,
      logger,
      text: "That draft has already been handled.",
    });
    return;
  }

  const provider = await createProviderForContext(context, logger);

  const mailboxDraftAction = getMailboxDraftActionForMessagingDraft(context);
  const initialContent = await getEditableDraftContent({
    context,
    provider,
    mailboxDraftAction,
  });

  await event.openModal({
    type: "modal",
    callbackId: SLACK_DRAFT_EDIT_MODAL_ID,
    title: "Edit draft",
    submitLabel: "Send reply",
    privateMetadata: context.id,
    children: [
      {
        type: "text_input",
        id: SLACK_DRAFT_EDIT_FIELD_ID,
        label: "Draft",
        multiline: true,
        initialValue: initialContent,
      },
    ],
  });
}

async function handleDismissNotification({
  context,
  event,
  logger,
}: {
  context: NotificationContext;
  event: ActionEvent;
  logger: Logger;
}) {
  if (!canSendDraft(context.messagingMessageStatus)) {
    await postNotificationFeedback({
      event,
      logger,
      text: isDraftReplyActionType(context.type)
        ? "That draft has already been handled."
        : "That notification has already been handled.",
    });
    return;
  }

  await prisma.executedAction.update({
    where: { id: context.id },
    data: {
      messagingMessageStatus: MessagingMessageStatus.DISMISSED,
    },
  });

  await event.adapter.editMessage(
    event.threadId,
    event.messageId,
    buildTerminalCard({
      title: isDraftReplyActionType(context.type)
        ? "Draft reply"
        : getInfoNotificationTitle(
            context.executedRule.rule?.systemType ?? null,
          ),
      message: "Dismissed.",
    }),
  );
}

async function handleArchiveNotification({
  context,
  event,
  logger,
}: {
  context: NotificationContext;
  event: ActionEvent;
  logger: Logger;
}) {
  const provider = await createProviderForContext(context, logger);

  await provider.archiveThread(
    context.executedRule.threadId,
    context.executedRule.emailAccount.email,
  );

  await event.adapter.editMessage(
    event.threadId,
    event.messageId,
    buildTerminalCard({
      title: getInfoNotificationTitle(
        context.executedRule.rule?.systemType ?? null,
      ),
      message: "Archived.",
    }),
  );
}

async function handleMarkReadNotification({
  context,
  event,
  logger,
}: {
  context: NotificationContext;
  event: ActionEvent;
  logger: Logger;
}) {
  const provider = await createProviderForContext(context, logger);

  await provider.markRead(context.executedRule.threadId);

  await event.adapter.editMessage(
    event.threadId,
    event.messageId,
    buildTerminalCard({
      title: getInfoNotificationTitle(
        context.executedRule.rule?.systemType ?? null,
      ),
      message: "Marked as read.",
    }),
  );
}

async function handleTrashNotification({
  context,
  event,
  logger,
}: {
  context: NotificationContext;
  event: ActionEvent;
  logger: Logger;
}) {
  const provider = await createProviderForContext(context, logger);

  await provider.trashThread(
    context.executedRule.threadId,
    context.executedRule.emailAccount.email,
    "user",
  );

  await event.adapter.editMessage(
    event.threadId,
    event.messageId,
    buildTerminalCard({
      title: getInfoNotificationTitle(
        context.executedRule.rule?.systemType ?? null,
      ),
      message: "Moved to trash.",
    }),
  );
}

async function handleMarkSpamNotification({
  context,
  event,
  logger,
}: {
  context: NotificationContext;
  event: ActionEvent;
  logger: Logger;
}) {
  const provider = await createProviderForContext(context, logger);

  await provider.markSpam(context.executedRule.threadId);

  await event.adapter.editMessage(
    event.threadId,
    event.messageId,
    buildTerminalCard({
      title: getInfoNotificationTitle(
        context.executedRule.rule?.systemType ?? null,
      ),
      message: "Marked as spam.",
    }),
  );
}

async function getAuthorizedSlackNotificationContext({
  executedActionId,
  logger,
  teamId,
  userId,
  event,
}: {
  executedActionId: string;
  logger: Logger;
  teamId: string | null;
  userId: string;
  event?: ActionEvent;
}) {
  const context = await getNotificationContext(executedActionId);

  if (
    !context?.messagingChannel ||
    !isOperationalSlackChannel(context.messagingChannel)
  ) {
    if (event) {
      await postNotificationFeedback({
        event,
        logger,
        text: "This notification is no longer active.",
      });
    }
    return null;
  }

  if (
    context.messagingChannel.providerUserId &&
    context.messagingChannel.providerUserId !== userId
  ) {
    if (event) {
      await postNotificationFeedback({
        event,
        logger,
        text: "You don't have permission to act on this notification.",
      });
    }
    return null;
  }

  if (teamId && context.messagingChannel.teamId !== teamId) {
    if (event) {
      await postNotificationFeedback({
        event,
        logger,
        text: "This notification no longer matches this workspace.",
      });
    }
    return null;
  }

  return context;
}

async function getAuthorizedTelegramNotificationContext({
  executedActionId,
  logger,
  chatId,
  userId,
  event,
}: {
  executedActionId: string;
  logger: Logger;
  chatId: string | null;
  userId: string;
  event?: ActionEvent;
}) {
  const context = await getNotificationContext(executedActionId);

  if (
    !context?.messagingChannel ||
    context.messagingChannel.provider !== MessagingProvider.TELEGRAM ||
    !context.messagingChannel.isConnected
  ) {
    if (event) {
      await postNotificationFeedback({
        event,
        logger,
        text: "This notification is no longer active.",
      });
    }
    return null;
  }

  if (
    context.messagingChannel.providerUserId &&
    context.messagingChannel.providerUserId !== userId
  ) {
    if (event) {
      await postNotificationFeedback({
        event,
        logger,
        text: "You don't have permission to act on this notification.",
      });
    }
    return null;
  }

  const expectedChatId =
    getMessagingRoute(
      context.messagingChannel.routes,
      MessagingRoutePurpose.RULE_NOTIFICATIONS,
    )?.targetId ?? context.messagingChannel.teamId;

  if (chatId && expectedChatId !== chatId) {
    if (event) {
      await postNotificationFeedback({
        event,
        logger,
        text: "This notification no longer matches this chat.",
      });
    }
    return null;
  }

  return context;
}

async function getNotificationContext(executedActionId: string) {
  return prisma.executedAction.findUnique({
    where: { id: executedActionId },
    select: {
      id: true,
      type: true,
      content: true,
      subject: true,
      to: true,
      cc: true,
      bcc: true,
      draftId: true,
      staticAttachments: true,
      selectedAttachments: true,
      messagingChannelId: true,
      messagingMessageId: true,
      messagingMessageStatus: true,
      executedRule: {
        select: {
          id: true,
          ruleId: true,
          messageId: true,
          threadId: true,
          emailAccount: {
            select: {
              id: true,
              userId: true,
              email: true,
              account: {
                select: {
                  provider: true,
                },
              },
            },
          },
          rule: {
            select: {
              systemType: true,
            },
          },
          actionItems: {
            where: {
              id: { not: executedActionId },
              type: ActionType.DRAFT_EMAIL,
              draftId: { not: null },
            },
            select: {
              id: true,
              draftId: true,
              subject: true,
            },
            orderBy: {
              createdAt: "asc",
            },
            take: 1,
          },
        },
      },
      messagingChannel: {
        select: {
          id: true,
          emailAccountId: true,
          provider: true,
          isConnected: true,
          teamId: true,
          providerUserId: true,
          accessToken: true,
          routes: {
            select: {
              purpose: true,
              targetType: true,
              targetId: true,
            },
          },
        },
      },
    },
  });
}

function getMailboxDraftActionForMessagingDraft(context: NotificationContext) {
  return context.executedRule.actionItems?.[0] ?? null;
}

async function getEditableDraftContent({
  context,
  provider,
  mailboxDraftAction,
}: {
  context: NotificationContext;
  provider: Awaited<ReturnType<typeof createEmailProvider>>;
  mailboxDraftAction: Awaited<
    ReturnType<typeof getMailboxDraftActionForMessagingDraft>
  >;
}) {
  if (mailboxDraftAction?.draftId) {
    try {
      const latestDraft = await provider.getDraft(mailboxDraftAction.draftId);
      if (latestDraft) {
        const text = stripQuotedContent(extractDraftPlainText(latestDraft));
        if (text) return text;
      }
    } catch {
      // Fall back to stored content below.
    }
  }

  return stripQuotedContent(context.content || "");
}

async function getNotificationDraftContent({
  context,
  logger,
}: {
  context: NotificationContext;
  logger: Logger;
}) {
  if (!isDraftReplyActionType(context.type)) return context.content;

  const mailboxDraftAction = getMailboxDraftActionForMessagingDraft(context);

  if (!mailboxDraftAction?.draftId) return context.content;

  try {
    const provider = await createProviderForContext(context, logger);

    return await getEditableDraftContent({
      context,
      provider,
      mailboxDraftAction,
    });
  } catch (error) {
    logger.warn(
      "Failed to load synced mailbox draft for notification preview",
      {
        executedActionId: context.id,
        mailboxDraftActionId: mailboxDraftAction.id,
        error,
      },
    );
    return context.content;
  }
}

function getNotificationDraftAttachmentNames({
  context,
  logger,
}: {
  context: NotificationContext;
  logger: Logger;
}) {
  if (!isDraftReplyActionType(context.type)) return [];

  const staticAttachmentNames = getStaticDraftAttachmentNames(
    context.staticAttachments,
  );
  const selectedAttachmentNames = getSelectedDraftAttachmentNames(
    context.selectedAttachments,
    logger,
    context.id,
  );

  return [...selectedAttachmentNames, ...staticAttachmentNames];
}

function getStaticDraftAttachmentNames(raw: unknown) {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];

  const parsed = attachmentSourceInputSchema.array().safeParse(raw);
  if (!parsed.success) return [];

  return parsed.data
    .filter((attachment) => attachment.type === AttachmentSourceType.FILE)
    .map((attachment) => attachment.name);
}

function getSelectedDraftAttachmentNames(
  raw: unknown,
  logger: Logger,
  executedActionId: string,
) {
  if (!raw || !Array.isArray(raw) || raw.length === 0) return [];

  const parsed = selectedAttachmentSchema.array().safeParse(raw);
  if (!parsed.success) {
    logger.warn("Skipping invalid selected attachment metadata", {
      executedActionId,
    });
    return [];
  }

  return parsed.data.map((attachment) => attachment.filename);
}

async function getSourceMessageSummaryForProvider({
  context,
  provider,
}: {
  context: NotificationContext;
  provider: Awaited<ReturnType<typeof createEmailProvider>>;
}) {
  const message = await provider.getMessage(context.executedRule.messageId);

  return {
    headers: {
      from: message.headers.from,
      subject: message.headers.subject,
    },
    snippet: message.snippet,
    textPlain: message.textPlain,
    textHtml: message.textHtml,
    attachments: message.attachments,
  };
}

function buildNotificationContent({
  actionType,
  email,
  systemType,
  draftContent,
  draftAttachmentNames,
  format,
}: {
  actionType: ActionType;
  email: NotificationEmailPreview;
  systemType: SystemType | null;
  draftContent?: string | null;
  draftAttachmentNames?: string[];
  format: NotificationContentFormat;
}): NotificationContent {
  if (isDraftReplyActionType(actionType)) {
    const senderName = formatNotificationText(
      extractNameFromEmail(email.headers.from),
      format,
    );
    const senderEmail = formatNotificationText(
      extractEmailAddress(email.headers.from),
      format,
    );
    const senderDisplay =
      senderEmail && senderName !== senderEmail
        ? `${senderName} (${senderEmail})`
        : senderName;
    const subject = formatNotificationText(
      truncate(he.decode(email.headers.subject), 80),
      format,
    );

    const emailPreview = buildEmailPreview(email, { format });
    const draftPreview = buildDraftPreview(draftContent, { format });

    const summary = `You got an email from *${senderDisplay}* about "${subject}".`;

    const details: string[] = [];
    if (emailPreview) {
      const preview =
        format === "slack"
          ? quotePlainTextContent(emailPreview) || emailPreview
          : emailPreview;
      details.push(`💬 *They wrote:*\n${preview}`);
    }
    details.push(`✍️ *I drafted a reply for you:*\n${draftPreview}`);
    const attachmentSummary = buildDraftAttachmentSummary(
      draftAttachmentNames,
      { format },
    );
    if (attachmentSummary) {
      details.push(`📎 *Attachments:* ${attachmentSummary}`);
    }

    return {
      title: "✍️ I drafted a reply for you",
      summary,
      details,
    };
  }

  if (systemType === SystemType.CALENDAR) {
    const calendarEvent = analyzeCalendarEvent(toCalendarPreviewMessage(email));

    const lines = [
      calendarEvent.eventTitle
        ? `Event: ${calendarEvent.eventTitle}`
        : `Subject: ${email.headers.subject}`,
      calendarEvent.eventDateString
        ? `When: ${calendarEvent.eventDateString}`
        : null,
      calendarEvent.organizer ? `Organizer: ${calendarEvent.organizer}` : null,
      buildEmailPreview(email, { format }),
    ].filter(Boolean);

    return {
      title: "📅 Calendar invite for you",
      summary: lines.join("\n"),
    };
  }

  return {
    title: getNotificationTitleForSystemType(systemType),
    summary: buildEmailSummary(email),
    details: [
      buildNotificationDetailSection({
        label: "Preview",
        value: buildEmailPreview(email, { format }),
      }),
    ].filter(Boolean) as string[],
  };
}

function buildNotificationCard({
  actionId,
  actionType,
  content,
  openLink,
}: {
  actionId: string;
  actionType: ActionType;
  content: NotificationContent;
  openLink?: NotificationOpenLink | null;
}): CardElement {
  const children = buildNotificationCardBody(content);

  children.push(
    Actions(
      isDraftReplyActionType(actionType)
        ? [
            Button({
              id: RULE_DRAFT_SEND_ACTION_ID,
              label: "Send reply",
              style: "primary",
              value: actionId,
            }),
            Button({
              id: RULE_DRAFT_EDIT_ACTION_ID,
              label: "Edit draft",
              value: actionId,
            }),
            ...(openLink ? [LinkButton(openLink)] : []),
            Button({
              id: RULE_DRAFT_DISMISS_ACTION_ID,
              label: "Dismiss",
              value: actionId,
            }),
          ]
        : [
            Button({
              id: RULE_NOTIFY_ARCHIVE_ACTION_ID,
              label: "Archive",
              style: "primary",
              value: actionId,
            }),
            Button({
              id: RULE_NOTIFY_MARK_READ_ACTION_ID,
              label: "Mark read",
              value: actionId,
            }),
            Select({
              id: RULE_NOTIFY_MORE_ACTION_ID,
              label: "More",
              placeholder: "More",
              options: [
                SelectOption({
                  label: "Delete",
                  value: `${RULE_NOTIFY_TRASH_ACTION_ID}:${actionId}`,
                }),
                SelectOption({
                  label: "Spam",
                  value: `${RULE_NOTIFY_MARK_SPAM_ACTION_ID}:${actionId}`,
                }),
              ],
            }),
            ...(openLink ? [LinkButton(openLink)] : []),
            Button({
              id: RULE_DRAFT_DISMISS_ACTION_ID,
              label: "Dismiss",
              value: actionId,
            }),
          ],
    ),
  );

  return Card({
    title: content.title,
    children,
  });
}

function buildTerminalCard({
  title,
  message,
}: {
  title: string;
  message: string;
}): CardElement {
  return Card({
    title,
    children: [CardText(message)],
  });
}

function buildTelegramNotificationCard({
  actionId,
  content,
  openLink,
}: {
  actionId: string;
  content: NotificationContent;
  openLink?: NotificationOpenLink | null;
}): CardElement {
  const children = buildNotificationCardBody(
    sanitizeTelegramNotificationContent(content),
  );
  children.push(
    Actions([
      Button({
        id: RULE_DRAFT_SEND_ACTION_ID,
        label: "Send reply",
        style: "primary",
        value: actionId,
      }),
      ...(openLink ? [LinkButton(openLink)] : []),
    ]),
  );

  return Card({
    children,
  });
}

function sanitizeTelegramNotificationContent(
  content: NotificationContent,
): NotificationContent {
  return {
    title: escapeTelegramMarkdown(content.title),
    summary: escapeTelegramMarkdown(markdownToTelegramText(content.summary)),
    details: content.details?.map((detail) =>
      escapeTelegramMarkdown(markdownToTelegramText(detail)),
    ),
  };
}

function buildHandledNotificationCard({
  content,
  openLink,
  status,
}: {
  content: NotificationContent;
  openLink?: NotificationOpenLink | null;
  status: string;
}): CardElement {
  const children = buildNotificationCardBody(content);
  children.push(CardText(`Status: ${status}`));
  if (openLink) {
    children.push(Actions([LinkButton(openLink)]));
  }

  return Card({
    title: content.title,
    children,
  });
}

function buildDraftPreview(
  content: string | null | undefined,
  { format }: { format: NotificationContentFormat },
) {
  if (!content?.trim()) return "No draft preview available.";

  const preview = stripQuotedContent(
    removeExcessiveWhitespace(richTextToSlackMrkdwn(he.decode(content))).trim(),
  );
  return truncate(
    format === "slack" ? preview : stripSlackFormatting(preview),
    DRAFT_PREVIEW_MAX_CHARS,
  );
}

function buildDraftAttachmentSummary(
  attachmentNames: string[] | null | undefined,
  { format }: { format: NotificationContentFormat },
) {
  const uniqueNames = [
    ...new Set(
      (attachmentNames ?? [])
        .map((name) => name.trim())
        .filter((name) => name.length > 0),
    ),
  ];
  if (uniqueNames.length === 0) return null;

  const visibleNames = uniqueNames
    .slice(0, MAX_DRAFT_ATTACHMENT_NAMES)
    .map((name) => formatNotificationText(name, format));
  const hiddenCount = uniqueNames.length - visibleNames.length;
  const suffix = hiddenCount > 0 ? ` and ${hiddenCount} more` : "";

  return `${visibleNames.join(", ")}${suffix}`;
}

function buildNotificationCardBody(content: NotificationContent): CardChild[] {
  const children: CardChild[] = [CardText(content.summary)];

  for (const detail of content.details ?? []) {
    children.push(CardText(detail));
  }

  return children;
}

export function buildMessagingRuleNotificationText({
  actionType,
  content,
  provider,
}: {
  actionType: ActionType;
  content: NotificationContent;
  provider: typeof MessagingProvider.TEAMS | typeof MessagingProvider.TELEGRAM;
}) {
  const sections = [
    content.title,
    stripSlackFormatting(content.summary),
    ...(content.details?.map(stripSlackFormatting) ?? []),
  ].filter(Boolean);

  const limitation = getLinkedProviderLimitationText({
    actionType,
    provider,
  });
  if (limitation) {
    sections.push(limitation);
  }

  return sections.join("\n\n");
}

function buildEmailSummary(email: {
  headers: {
    from: string;
    subject: string;
  };
}) {
  return [
    `*From:* ${email.headers.from}`,
    `*Subject:* ${email.headers.subject}`,
  ].join("\n");
}

function buildEmailPreview(
  email: {
    snippet: string;
    textPlain?: string;
    textHtml?: string;
  },
  { format }: { format: NotificationContentFormat },
) {
  const rawPreview = emailToContent(email, {
    maxLength: 0,
    extractReply: true,
  });
  const preview = formatNotificationText(
    removeExcessiveWhitespace(he.decode(rawPreview)).trim(),
    format,
  );
  if (!preview) return null;

  return truncate(preview, SUMMARY_PREVIEW_MAX_CHARS);
}

function formatNotificationText(
  text: string,
  format: NotificationContentFormat,
) {
  return format === "slack" ? escapeSlackText(text) : text;
}

function buildNotificationDetailSection({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  const normalizedValue = value?.trim();
  if (!normalizedValue) return null;

  return `*${label}*\n${normalizedValue}`;
}

function createProviderForContext(
  context: NotificationContext,
  logger: Logger,
) {
  return createEmailProvider({
    emailAccountId: context.executedRule.emailAccount.id,
    provider: context.executedRule.emailAccount.account.provider,
    logger,
  });
}

function getInfoNotificationTitle(systemType: SystemType | null) {
  return systemType === SystemType.CALENDAR
    ? "Calendar invite"
    : "Email notification";
}

function getNotificationOpenLink(
  context: NotificationContext,
): NotificationOpenLink | null {
  const provider = context.executedRule.emailAccount.account.provider;
  const label = isGoogleProvider(provider)
    ? "Open in Gmail"
    : isMicrosoftProvider(provider)
      ? "Open in Outlook"
      : null;
  if (!label) return null;

  const url = getEmailUrlForOptionalMessage({
    messageId: context.executedRule.messageId,
    threadId: context.executedRule.threadId,
    emailAddress: context.executedRule.emailAccount.email,
    provider,
  });
  if (!url) return null;

  return {
    label,
    url,
  };
}

async function findSlackRootMessageId({
  executedActionId,
  emailAccountId,
  messagingChannelId,
  threadId,
}: {
  executedActionId: string;
  emailAccountId: string;
  messagingChannelId: string;
  threadId: string;
}) {
  const previous = await prisma.executedAction.findFirst({
    where: {
      id: { not: executedActionId },
      messagingChannelId,
      messagingMessageId: { not: null },
      executedRule: {
        emailAccountId,
        threadId,
      },
    },
    select: {
      messagingMessageId: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return previous?.messagingMessageId ?? null;
}

async function postSlackCard({
  accessToken,
  card,
  route,
  destinationChannelId,
  rootMessageId,
}: {
  accessToken: string;
  card: CardElement;
  route: {
    targetId: string;
    targetType: MessagingRouteTargetType;
  } | null;
  destinationChannelId: string;
  rootMessageId: string | null;
}) {
  const client = createSlackClient(accessToken);

  const args = disableSlackLinkUnfurls({
    channel: destinationChannelId,
    text: cardToFallbackText(card),
    blocks: cardToBlockKit(card),
    ...(rootMessageId ? { thread_ts: rootMessageId } : {}),
  });

  try {
    const response = await client.chat.postMessage(args);
    return response.ts ?? null;
  } catch (error) {
    if (
      isSlackError(error) &&
      error.data?.error === "not_in_channel" &&
      route?.targetType === MessagingRouteTargetType.CHANNEL
    ) {
      await client.conversations.join({ channel: route.targetId });
      const response = await client.chat.postMessage({
        ...args,
        channel: route.targetId,
      });
      return response.ts ?? null;
    }

    throw error;
  }
}

async function replaceMessagingDraftNotificationWithHandledOnWebState({
  executedActionId,
  logger,
}: {
  executedActionId: string;
  logger: Logger;
}) {
  const context = await getNotificationContext(executedActionId);

  if (!context?.messagingMessageId) {
    return;
  }

  const updated = await prisma.executedAction.updateMany({
    where: {
      id: context.id,
      OR: [
        { messagingMessageStatus: null },
        {
          messagingMessageStatus: {
            in: [
              MessagingMessageStatus.SENT,
              MessagingMessageStatus.DRAFT_EDITED,
            ],
          },
        },
      ],
    },
    data: {
      messagingMessageStatus: MessagingMessageStatus.EXPIRED,
    },
  });

  if (updated.count === 0) {
    return;
  }

  if (
    !context.messagingChannel ||
    !isMessagingChannelOperational(context.messagingChannel)
  ) {
    logger.warn(
      "Skipping messaging draft notification cleanup for disconnected channel",
      {
        executedActionId: context.id,
        messagingChannelId: context.messagingChannelId,
        provider: context.messagingChannel?.provider,
      },
    );
    return;
  }

  const route = getMessagingRoute(
    context.messagingChannel.routes,
    MessagingRoutePurpose.RULE_NOTIFICATIONS,
  );

  if (!route) {
    logger.warn("Skipping messaging draft notification cleanup with no route", {
      executedActionId: context.id,
      messagingChannelId: context.messagingChannelId,
      provider: context.messagingChannel.provider,
    });
    return;
  }

  const card = buildTerminalCard({
    title: "Draft reply",
    message: "Already replied on the web.",
  });

  try {
    switch (context.messagingChannel.provider) {
      case MessagingProvider.SLACK: {
        const destinationChannelId = await resolveSlackRouteDestination({
          accessToken: context.messagingChannel.accessToken,
          route,
        });

        if (!destinationChannelId) {
          logger.warn(
            "Skipping Slack draft notification cleanup with no destination",
            {
              executedActionId: context.id,
              messagingChannelId: context.messagingChannelId,
            },
          );
          return;
        }

        await createSlackClient(
          context.messagingChannel.accessToken,
        ).chat.update(
          disableSlackLinkUnfurls({
            channel: destinationChannelId,
            ts: context.messagingMessageId,
            text: cardToFallbackText(card),
            blocks: cardToBlockKit(card),
          }),
        );
        break;
      }
      case MessagingProvider.TEAMS: {
        const providerUserId =
          route.targetType === MessagingRouteTargetType.DIRECT_MESSAGE
            ? route.targetId
            : context.messagingChannel.providerUserId;

        if (!providerUserId) {
          logger.warn(
            "Skipping Teams draft notification cleanup with no destination user",
            {
              executedActionId: context.id,
              messagingChannelId: context.messagingChannelId,
            },
          );
          return;
        }

        const teamsAdapter = getMessagingAdapterRegistry().typedAdapters.teams;
        if (!teamsAdapter) {
          logger.warn(
            "Skipping Teams draft notification cleanup without adapter",
            {
              executedActionId: context.id,
              messagingChannelId: context.messagingChannelId,
            },
          );
          return;
        }

        const threadId = await teamsAdapter.openDM(providerUserId);
        await teamsAdapter.editMessage(
          threadId,
          context.messagingMessageId,
          "Already replied on the web.",
        );
        break;
      }
      case MessagingProvider.TELEGRAM: {
        const destination = route.targetId || context.messagingChannel.teamId;
        if (!destination) {
          logger.warn(
            "Skipping Telegram draft notification cleanup with no destination",
            {
              executedActionId: context.id,
              messagingChannelId: context.messagingChannelId,
            },
          );
          return;
        }

        const telegramAdapter =
          getMessagingAdapterRegistry().typedAdapters.telegram;
        if (!telegramAdapter) {
          logger.warn(
            "Skipping Telegram draft notification cleanup without adapter",
            {
              executedActionId: context.id,
              messagingChannelId: context.messagingChannelId,
            },
          );
          return;
        }

        const threadId = await telegramAdapter.openDM(destination);
        await telegramAdapter.editMessage(
          threadId,
          context.messagingMessageId,
          "Already replied on the web.",
        );
        break;
      }
      default:
        return;
    }
  } catch (error) {
    logger.warn(
      "Failed to collapse messaging draft notification after web reply",
      {
        executedActionId: context.id,
        provider: context.messagingChannel.provider,
        error,
      },
    );
  }
}

async function postNotificationFeedback({
  event,
  logger,
  text,
}: {
  event: ActionEvent;
  logger: Logger;
  text: string;
}) {
  const thread = event.thread;
  if (!thread) return;

  if (event.adapter.name === "slack") {
    try {
      await thread.postEphemeral(event.user, text, { fallbackToDM: false });
      return;
    } catch (error) {
      logger.warn("Failed to post Slack notification feedback", {
        actionId: event.actionId,
        error,
      });
    }
  }

  try {
    await thread.post(text);
  } catch (error) {
    logger.warn("Failed to post rule notification feedback", {
      actionId: event.actionId,
      error,
    });
  }
}

function serializeMailAttachments(attachments: MailAttachment[]) {
  return attachments
    .map((attachment) => {
      if (!attachment.filename || !attachment.content) return null;

      const content = Buffer.isBuffer(attachment.content)
        ? attachment.content.toString("base64")
        : Buffer.from(String(attachment.content)).toString("base64");

      return {
        filename: attachment.filename,
        content,
        contentType: attachment.contentType || "application/octet-stream",
      };
    })
    .filter(Boolean) as Array<{
    filename: string;
    content: string;
    contentType: string;
  }>;
}

function canSendDraft(status: MessagingMessageStatus | null) {
  return (
    status !== MessagingMessageStatus.DRAFT_SENT &&
    status !== MessagingMessageStatus.DISMISSED &&
    status !== MessagingMessageStatus.EXPIRED
  );
}

function canEditDraft(status: MessagingMessageStatus | null) {
  return canSendDraft(status);
}

function getSlackTeamId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;

  const maybeTeam = (raw as { team?: { id?: string } }).team?.id;
  return maybeTeam || null;
}

function getTelegramChatId(event: ActionEvent): string | null {
  const rawChatId =
    (event.raw as { message?: { chat?: { id?: string | number } } })?.message
      ?.chat?.id ??
    (
      event.raw as {
        callback_query?: { message?: { chat?: { id?: string | number } } };
      }
    )?.callback_query?.message?.chat?.id;
  if (rawChatId !== undefined && rawChatId !== null) {
    return String(rawChatId);
  }

  try {
    const decoded = event.adapter.decodeThreadId(event.threadId) as {
      chatId?: string | number;
    } | null;
    if (decoded?.chatId !== undefined && decoded.chatId !== null) {
      return String(decoded.chatId);
    }
  } catch {
    // Fall back to providerUserId-only authorization below.
  }

  return null;
}

function isSlackError(
  error: unknown,
): error is Error & { data?: { error?: string } } {
  return error instanceof Error && "data" in error;
}

function toCalendarPreviewMessage(
  email: NotificationEmailPreview,
): ParsedMessage {
  return {
    attachments: (email.attachments ?? []).map((attachment) => ({
      attachmentId: "",
      filename: attachment.filename,
      headers: {
        "content-description": "",
        "content-id": "",
        "content-transfer-encoding": "",
        "content-type": "",
      },
      mimeType: "",
      size: 0,
    })),
    bodyContentType: "text",
    date: "",
    headers: {
      date: "",
      from: email.headers.from,
      subject: email.headers.subject,
      to: "",
    },
    historyId: "",
    id: "",
    inline: [],
    snippet: email.snippet,
    subject: email.headers.subject,
    textHtml: email.textHtml,
    textPlain: email.textPlain,
    threadId: "",
  };
}

function stripSlackFormatting(text: string) {
  return text
    .replace(/<([^|>]+)\|([^>]+)>/g, "$2: $1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function getLinkedProviderLimitationText({
  actionType,
  provider,
}: {
  actionType: ActionType;
  provider: typeof MessagingProvider.TEAMS | typeof MessagingProvider.TELEGRAM;
}) {
  const providerName =
    provider === MessagingProvider.TEAMS ? "Teams" : "Telegram";

  if (isDraftReplyActionType(actionType)) {
    return provider === MessagingProvider.TEAMS
      ? "One-click draft editing and sending aren't available in Teams yet. Use Inbox Zero to review or send this draft."
      : "Draft editing isn't available in Telegram yet. You can send this draft from Telegram or use Inbox Zero to revise it first.";
  }

  return `Quick actions like archive and mark read are Slack-only right now, so this ${providerName} message is view-only.`;
}

function getNotificationTitleForSystemType(
  systemType: SystemType | null,
): string {
  switch (systemType) {
    case SystemType.NEWSLETTER:
      return "📰 New newsletter for you";
    case SystemType.MARKETING:
      return "📢 New marketing email for you";
    case SystemType.RECEIPT:
      return "🧾 New receipt for you";
    case SystemType.COLD_EMAIL:
      return "❄️ Cold email caught";
    case SystemType.FYI:
      return "👀 FYI for you";
    case SystemType.NOTIFICATION:
      return "🔔 New notification for you";
    default:
      return "📬 New email for you";
  }
}
