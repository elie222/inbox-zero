import type { Attachment as MailAttachment } from "nodemailer/lib/mailer";
import {
  Actions,
  Button,
  Card,
  CardText,
  LinkButton,
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
import { resolveActionAttachments } from "@/utils/ai/action-attachments";
import { quotePlainTextContent } from "@/utils/email/quoted-plain-text";
import { formatReplySubject } from "@/utils/email/subject";
import { extractDraftPlainText } from "@/utils/ai/choose-rule/draft-management";
import type { ParsedMessage } from "@/utils/types";
import he from "he";
import { isDraftReplyActionType } from "@/utils/actions/draft-reply";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { getMessagingRoute } from "@/utils/messaging/routes";
import { getEmailUrlForOptionalMessage } from "@/utils/url";

const DRAFT_PREVIEW_MAX_CHARS = 900;
const SUMMARY_PREVIEW_MAX_CHARS = 2000;
const SLACK_DRAFT_SEND_ACTION_ID = "rule_draft_send";
const SLACK_DRAFT_EDIT_ACTION_ID = "rule_draft_edit";
const SLACK_DRAFT_DISMISS_ACTION_ID = "rule_draft_dismiss";
const SLACK_NOTIFY_ARCHIVE_ACTION_ID = "rule_notify_archive";
const SLACK_NOTIFY_MARK_READ_ACTION_ID = "rule_notify_mark_read";
export const SLACK_DRAFT_EDIT_MODAL_ID = "rule_draft_edit_modal";
const SLACK_DRAFT_EDIT_FIELD_ID = "draft_content";

export const SLACK_RULE_NOTIFICATION_ACTION_IDS = [
  SLACK_DRAFT_SEND_ACTION_ID,
  SLACK_DRAFT_EDIT_ACTION_ID,
  SLACK_DRAFT_DISMISS_ACTION_ID,
  SLACK_NOTIFY_ARCHIVE_ACTION_ID,
  SLACK_NOTIFY_MARK_READ_ACTION_ID,
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
    !context.messagingChannel?.isConnected ||
    context.messagingChannel.provider !== MessagingProvider.SLACK ||
    !context.messagingChannel.accessToken
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

  const content = buildNotificationContent({
    actionType: context.type,
    email,
    systemType: context.executedRule.rule?.systemType ?? null,
    draftContent: context.content,
    format: "slack",
  });

  const rootMessageId =
    (await findSlackRootMessageId({
      executedActionId: context.id,
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
    !context.messagingChannel?.isConnected ||
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

  const content = buildNotificationContent({
    actionType: context.type,
    email,
    systemType: context.executedRule.rule?.systemType ?? null,
    draftContent: context.content,
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

export async function handleSlackRuleNotificationAction({
  event,
  logger,
}: {
  event: ActionEvent;
  logger: Logger;
}) {
  const executedActionId = event.value?.trim();
  if (!executedActionId) {
    await postNotificationFeedback({
      event,
      logger,
      text: "That notification is invalid or expired.",
    });
    return;
  }

  const context = await getAuthorizedNotificationContext({
    executedActionId,
    logger,
    teamId: getSlackTeamId(event.raw),
    userId: event.user.userId,
    event,
  });
  if (!context) return;

  switch (event.actionId) {
    case SLACK_DRAFT_SEND_ACTION_ID:
      await handleDraftSend({ context, event, logger });
      return;
    case SLACK_DRAFT_EDIT_ACTION_ID:
      await handleDraftEdit({ context, event, logger });
      return;
    case SLACK_DRAFT_DISMISS_ACTION_ID:
      await handleDraftDismiss({ context, event, logger });
      return;
    case SLACK_NOTIFY_ARCHIVE_ACTION_ID:
      await handleArchiveNotification({ context, event, logger });
      return;
    case SLACK_NOTIFY_MARK_READ_ACTION_ID:
      await handleMarkReadNotification({ context, event, logger });
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

  const context = await getAuthorizedNotificationContext({
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

  const siblingDraftAction = await getSiblingEmailDraftAction({
    executedActionId: context.id,
    executedRuleId: context.executedRule.id,
  });

  if (siblingDraftAction?.draftId) {
    try {
      const provider = await createProviderForContext(context, logger);

      await provider.updateDraft(siblingDraftAction.draftId, {
        messageHtml: convertNewlinesToBr(escapeHtml(nextContent)),
        ...(siblingDraftAction.subject
          ? { subject: siblingDraftAction.subject }
          : {}),
      });
    } catch (error) {
      logger.warn("Failed to sync edited Slack draft back to email draft", {
        executedActionId: context.id,
        siblingDraftActionId: siblingDraftAction.id,
        error,
      });
    }
  }

  await prisma.executedAction.updateMany({
    where: {
      id: {
        in: [context.id, siblingDraftAction?.id].filter(Boolean) as string[],
      },
    },
    data: {
      content: nextContent,
    },
  });

  await prisma.executedAction.update({
    where: { id: context.id },
    data: {
      messagingMessageStatus: MessagingMessageStatus.DRAFT_EDITED,
    },
  });

  const content = buildNotificationContent({
    actionType: context.type,
    email: await getSourceMessageSummary(context, logger),
    systemType: context.executedRule.rule?.systemType ?? null,
    draftContent: nextContent,
    format: "slack",
  });

  if (event.relatedMessage) {
    await event.relatedMessage.edit(
      buildNotificationCard({
        actionId: context.id,
        actionType: context.type,
        content,
        openLink: getNotificationOpenLink(context),
      }),
    );
  }

  return { action: "close" };
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

  const provider = await createProviderForContext(context, logger);

  const siblingDraftAction = await getSiblingEmailDraftAction({
    executedActionId: context.id,
    executedRuleId: context.executedRule.id,
  });

  try {
    const finalDraftContent = await getEditableDraftContent({
      context,
      provider,
      siblingDraftAction,
    });
    const sourceMessageSummary = await getSourceMessageSummaryForProvider({
      context,
      provider,
    });
    const notificationContent = buildNotificationContent({
      actionType: context.type,
      email: sourceMessageSummary,
      systemType: context.executedRule.rule?.systemType ?? null,
      draftContent: finalDraftContent,
      format: "slack",
    });

    if (siblingDraftAction?.draftId) {
      await provider.sendDraft(siblingDraftAction.draftId);
    } else {
      const sourceMessage = await provider.getMessage(
        context.executedRule.messageId,
      );
      const attachments = await resolveActionAttachments({
        email: sourceMessage,
        emailAccountId: context.executedRule.emailAccount.id,
        executedRule: {
          id: context.executedRule.id,
          threadId: context.executedRule.threadId,
          emailAccountId: context.executedRule.emailAccount.id,
          ruleId: context.executedRule.ruleId,
        } as ExecutedRule,
        userId: context.executedRule.emailAccount.userId,
        logger,
        staticAttachments: context.staticAttachments,
        includeAiSelectedAttachments: true,
      });

      const content = context.content?.trim();
      if (!content) {
        await expireNotificationCard({
          event,
          logger,
          actionId: context.id,
          title: "Draft unavailable",
          message: "This draft is no longer available.",
        });
        return;
      }

      await provider.sendEmailWithHtml({
        replyToEmail: {
          threadId: sourceMessage.threadId,
          headerMessageId: sourceMessage.headers["message-id"] || "",
          references: sourceMessage.headers.references,
          messageId: sourceMessage.id,
        },
        to:
          context.to ||
          sourceMessage.headers["reply-to"] ||
          sourceMessage.headers.from,
        cc: context.cc ?? undefined,
        bcc: context.bcc ?? undefined,
        subject:
          context.subject || formatReplySubject(sourceMessage.headers.subject),
        messageHtml: convertNewlinesToBr(escapeHtml(content)),
        attachments: serializeMailAttachments(attachments),
      });
    }

    await prisma.executedAction.update({
      where: { id: context.id },
      data: {
        messagingMessageStatus: MessagingMessageStatus.DRAFT_SENT,
        wasDraftSent: true,
      },
    });

    if (siblingDraftAction?.id) {
      await prisma.executedAction.update({
        where: { id: siblingDraftAction.id },
        data: {
          wasDraftSent: true,
        },
      });
    }

    await event.adapter.editMessage(
      event.threadId,
      event.messageId,
      buildHandledNotificationCard({
        content: notificationContent,
        openLink: getNotificationOpenLink(context),
        status: "Reply sent.",
      }),
    );
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

  const siblingDraftAction = await getSiblingEmailDraftAction({
    executedActionId: context.id,
    executedRuleId: context.executedRule.id,
  });
  const initialContent = await getEditableDraftContent({
    context,
    provider,
    siblingDraftAction,
  });

  await event.openModal({
    type: "modal",
    callbackId: SLACK_DRAFT_EDIT_MODAL_ID,
    title: "Edit draft",
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

async function handleDraftDismiss({
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
      title: "Draft reply",
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

async function getAuthorizedNotificationContext({
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
    context.messagingChannel.provider !== MessagingProvider.SLACK ||
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
      messagingChannelId: true,
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

async function getSiblingEmailDraftAction({
  executedActionId,
  executedRuleId,
}: {
  executedActionId: string;
  executedRuleId: string;
}) {
  return prisma.executedAction.findFirst({
    where: {
      executedRuleId,
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
  });
}

async function getEditableDraftContent({
  context,
  provider,
  siblingDraftAction,
}: {
  context: NotificationContext;
  provider: Awaited<ReturnType<typeof createEmailProvider>>;
  siblingDraftAction: Awaited<ReturnType<typeof getSiblingEmailDraftAction>>;
}) {
  if (siblingDraftAction?.draftId) {
    try {
      const latestDraft = await provider.getDraft(siblingDraftAction.draftId);
      if (latestDraft) {
        const text = extractDraftPlainText(latestDraft).trim();
        if (text) return text;
      }
    } catch {
      // Fall back to stored content below.
    }
  }

  return context.content || "";
}

async function getSourceMessageSummary(
  context: NotificationContext,
  logger: Logger,
) {
  const provider = await createProviderForContext(context, logger);
  return getSourceMessageSummaryForProvider({ context, provider });
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
  format,
}: {
  actionType: ActionType;
  email: NotificationEmailPreview;
  systemType: SystemType | string | null;
  draftContent?: string | null;
  format: NotificationContentFormat;
}): NotificationContent {
  if (isDraftReplyActionType(actionType)) {
    const senderName = escapeSlackText(
      extractNameFromEmail(email.headers.from),
    );
    const senderEmail = escapeSlackText(
      extractEmailAddress(email.headers.from),
    );
    const senderDisplay =
      senderEmail && senderName !== senderEmail
        ? `${senderName} (${senderEmail})`
        : senderName;
    const subject = escapeSlackText(
      truncate(he.decode(email.headers.subject), 80),
    );

    const emailPreview = buildEmailPreview(email);
    const draftPreview = buildDraftPreview(draftContent);

    const summary = `📩 You got an email from *${senderDisplay}* about "${subject}".`;

    const details: string[] = [];
    if (emailPreview) {
      const preview =
        format === "slack"
          ? quotePlainTextContent(emailPreview) || emailPreview
          : emailPreview;
      details.push(`💬 *They wrote:*\n${preview}`);
    }
    details.push(`✍️ *I drafted a reply for you:*\n${draftPreview}`);

    return {
      title: "New email — reply drafted",
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
      buildEmailPreview(email),
    ].filter(Boolean);

    return {
      title: "Calendar invite",
      summary: lines.join("\n"),
    };
  }

  return {
    title: "Email notification",
    summary: buildEmailSummary(email),
    details: [
      buildNotificationDetailSection({
        label: "Preview",
        value: buildEmailPreview(email),
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
              id: SLACK_DRAFT_SEND_ACTION_ID,
              label: "Send reply",
              style: "primary",
              value: actionId,
            }),
            Button({
              id: SLACK_DRAFT_EDIT_ACTION_ID,
              label: "Edit draft",
              value: actionId,
            }),
            ...(openLink ? [LinkButton(openLink)] : []),
            Button({
              id: SLACK_DRAFT_DISMISS_ACTION_ID,
              label: "Dismiss",
              value: actionId,
            }),
          ]
        : [
            Button({
              id: SLACK_NOTIFY_ARCHIVE_ACTION_ID,
              label: "Archive",
              style: "primary",
              value: actionId,
            }),
            Button({
              id: SLACK_NOTIFY_MARK_READ_ACTION_ID,
              label: "Mark read",
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

function buildDraftPreview(content?: string | null) {
  if (!content?.trim()) return "No draft preview available.";

  return truncate(
    removeExcessiveWhitespace(richTextToSlackMrkdwn(he.decode(content))).trim(),
    DRAFT_PREVIEW_MAX_CHARS,
  );
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

function buildEmailPreview(email: { snippet: string; textPlain?: string }) {
  const rawPreview = email.snippet || email.textPlain || "";
  const preview = escapeSlackText(
    removeExcessiveWhitespace(he.decode(rawPreview)).trim(),
  );
  if (!preview) return null;

  return truncate(preview, SUMMARY_PREVIEW_MAX_CHARS);
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

function getInfoNotificationTitle(systemType: SystemType | string | null) {
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
  messagingChannelId,
  threadId,
}: {
  executedActionId: string;
  messagingChannelId: string;
  threadId: string;
}) {
  const previous = await prisma.executedAction.findFirst({
    where: {
      id: { not: executedActionId },
      messagingChannelId,
      messagingMessageId: { not: null },
      executedRule: {
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

async function expireNotificationCard({
  event,
  logger,
  actionId,
  title,
  message,
}: {
  event: ActionEvent;
  logger: Logger;
  actionId: string;
  title: string;
  message: string;
}) {
  await prisma.executedAction.update({
    where: { id: actionId },
    data: {
      messagingMessageStatus: MessagingMessageStatus.EXPIRED,
    },
  });

  await event.adapter.editMessage(
    event.threadId,
    event.messageId,
    buildTerminalCard({ title, message }),
  );

  await postNotificationFeedback({
    event,
    logger,
    text: message,
  });
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
  if (!event.thread) return;

  try {
    await event.thread.postEphemeral(event.user, text, { fallbackToDM: false });
  } catch (error) {
    logger.warn("Failed to post Slack notification feedback", {
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
    return "One-click draft editing and sending are Slack-only right now. Use Inbox Zero or Slack if you want to edit or send this draft from chat.";
  }

  return `Quick actions like archive and mark read are Slack-only right now, so this ${providerName} message is view-only.`;
}
