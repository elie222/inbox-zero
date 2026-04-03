import { after } from "next/server";
import { ActionType, MessagingMessageStatus } from "@/generated/prisma/enums";
import type { ExecutedRule } from "@/generated/prisma/client";
import type { Logger } from "@/utils/logger";
import { callWebhook } from "@/utils/webhook";
import type { ActionItem, EmailForAction } from "@/utils/ai/types";
import type { EmailProvider } from "@/utils/email/types";
import { enqueueDigestItem } from "@/utils/digest/index";
import { filterNullProperties } from "@/utils";
import { labelMessageAndSync } from "@/utils/label.server";
import { hasVariables } from "@/utils/template";
import prisma from "@/utils/prisma";
import { sendColdEmailNotification } from "@/utils/cold-email/send-notification";
import { extractEmailAddress } from "@/utils/email";
import { captureException } from "@/utils/error";
import { env } from "@/env";
import { ensureEmailSendingEnabled } from "@/utils/mail";
import { resolveActionAttachments } from "@/utils/ai/action-attachments";
import {
  getMessagingRuleNotificationResult,
  sendMessagingRuleNotification,
} from "@/utils/messaging/rule-notifications";
import { isMessagingDraftActionType } from "@/utils/actions/draft-reply";

const MODULE = "ai-actions";

type ExecutedRuleForAction = ExecutedRule & {
  actionItems?: Pick<ActionItem, "type">[];
};

type ActionFunction<T extends Partial<Omit<ActionItem, "type">>> = (options: {
  client: EmailProvider;
  email: EmailForAction;
  args: T & Pick<ActionItem, "id">;
  userEmail: string;
  userId: string;
  emailAccountId: string;
  executedRule: ExecutedRuleForAction;
  logger: Logger;
}) => Promise<unknown>;

export const runActionFunction = async (options: {
  client: EmailProvider;
  email: EmailForAction;
  action: ActionItem;
  userEmail: string;
  userId: string;
  emailAccountId: string;
  executedRule: ExecutedRuleForAction;
  logger: Logger;
}) => {
  const { action, userEmail, logger } = options;
  const log = logger.with({ module: MODULE });

  log.info("Running action", {
    actionType: action.type,
    userEmail,
    id: action.id,
  });
  log.trace("Running action", () => filterNullProperties(action));

  const { type, ...args } = action;
  const opts = {
    ...options,
    args,
    logger: log,
  };
  switch (type) {
    case ActionType.ARCHIVE:
      return archive(opts);
    case ActionType.LABEL:
      return label(opts);
    case ActionType.DRAFT_EMAIL:
      return draft(opts);
    case ActionType.DRAFT_MESSAGING_CHANNEL:
      return draft_messaging_channel(opts);
    case ActionType.NOTIFY_MESSAGING_CHANNEL:
      return notify_messaging_channel(opts);
    case ActionType.REPLY:
      ensureEmailSendingEnabled();
      return reply(opts);
    case ActionType.SEND_EMAIL:
      ensureEmailSendingEnabled();
      return send_email(opts);
    case ActionType.FORWARD:
      ensureEmailSendingEnabled();
      return forward(opts);
    case ActionType.MARK_SPAM:
      return mark_spam(opts);
    case ActionType.CALL_WEBHOOK:
      return call_webhook(opts);
    case ActionType.MARK_READ:
      return mark_read(opts);
    case ActionType.DIGEST:
      return digest(opts);
    case ActionType.MOVE_FOLDER:
      return move_folder(opts);
    case ActionType.NOTIFY_SENDER:
      return notify_sender(opts);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

const archive: ActionFunction<Record<string, unknown>> = async ({
  client,
  email,
  userEmail,
}) => {
  await client.archiveThread(email.threadId, userEmail);
};

const label: ActionFunction<{
  label?: string | null;
  labelId?: string | null;
}> = async ({ client, email, args, emailAccountId, logger }) => {
  logger.info("Label action started", {
    label: args.label,
    labelId: args.labelId,
  });

  const originalLabelId = args.labelId;
  let labelIdToUse = originalLabelId;

  if (!labelIdToUse && args.label) {
    if (hasVariables(args.label)) {
      logger.error("Template label not processed by AI", { label: args.label });
      return;
    }

    const matchingLabel = await client.getLabelByName(args.label);

    if (matchingLabel) {
      labelIdToUse = matchingLabel.id;
    } else {
      logger.info("Label not found, creating it", { labelName: args.label });
      const createdLabel = await client.createLabel(args.label);
      labelIdToUse = createdLabel.id;

      if (!labelIdToUse) {
        logger.error("Failed to create label", { labelName: args.label });
        return;
      }
    }
  }

  if (!labelIdToUse) return;

  await labelMessageAndSync({
    provider: client,
    messageId: email.id,
    labelId: labelIdToUse,
    labelName: args.label || null,
    emailAccountId,
    logger,
  });

  if (!originalLabelId && labelIdToUse && args.label) {
    after(() =>
      lazyUpdateActionLabelId({
        labelName: args.label!,
        labelId: labelIdToUse!,
        emailAccountId,
        logger,
      }),
    );
  }
};

const draft: ActionFunction<{
  messagingChannelId?: string | null;
  subject?: string | null;
  content?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
  staticAttachments?: ActionItem["staticAttachments"];
}> = async ({
  client,
  email,
  args,
  userEmail,
  userId,
  emailAccountId,
  executedRule,
  logger,
}) => {
  if (env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED) return;

  if (
    isLegacyMessagingDraft({
      executedRule,
      messagingChannelId: args.messagingChannelId,
    })
  ) {
    if (args.id) {
      const notificationResult = await getMessagingRuleNotificationResult({
        executedActionId: args.id,
        email,
        logger,
      });

      if (
        notificationResult.delivered &&
        notificationResult.kind === "interactive"
      ) {
        return;
      }

      if (!notificationResult.delivered) {
        logger.warn(
          "Falling back to mailbox draft after messaging delivery failure",
          {
            actionId: args.id,
          },
        );
      }
    }
  }

  const attachments = await resolveActionAttachments({
    email,
    emailAccountId,
    executedRule,
    userId,
    logger,
    staticAttachments: args.staticAttachments,
    includeAiSelectedAttachments: true,
  });

  const draftArgs = {
    to: args.to ?? undefined,
    subject: args.subject ?? undefined,
    content: args.content ?? "",
    cc: args.cc ?? undefined,
    bcc: args.bcc ?? undefined,
    attachments,
  };

  const result = await client.draftEmail(
    {
      id: email.id,
      threadId: email.threadId,
      headers: email.headers,
      internalDate: email.internalDate,
      snippet: "",
      historyId: "",
      inline: [],
      subject: email.headers.subject,
      date: email.headers.date,
      labelIds: [],
      textPlain: email.textPlain,
      textHtml: email.textHtml,
      attachments: email.attachments,
    },
    draftArgs,
    userEmail,
    executedRule,
  );
  return { draftId: result.draftId };
};

const draft_messaging_channel: ActionFunction<{
  messagingChannelId?: string | null;
}> = async ({ email, args, logger }) => {
  if (!args.id) {
    throw new Error("Missing action id for DRAFT_MESSAGING_CHANNEL");
  }

  if (!args.messagingChannelId) {
    await failMessagingAction({
      actionId: args.id,
      logger,
      reason: "Missing messaging channel for DRAFT_MESSAGING_CHANNEL",
    });
  }

  const delivered = await sendMessagingRuleNotification({
    executedActionId: args.id,
    email,
    logger,
  });

  if (delivered) return;

  await failMessagingAction({
    actionId: args.id,
    logger,
    reason: "Failed to deliver DRAFT_MESSAGING_CHANNEL notification",
  });
};

const notify_messaging_channel: ActionFunction<{
  messagingChannelId?: string | null;
}> = async ({ email, args, logger }) => {
  if (!args.id) {
    throw new Error("Missing action id for NOTIFY_MESSAGING_CHANNEL");
  }

  if (!args.messagingChannelId) {
    await failMessagingAction({
      actionId: args.id,
      logger,
      reason: "Missing messaging channel for NOTIFY_MESSAGING_CHANNEL",
    });
  }

  const delivered = await sendMessagingRuleNotification({
    executedActionId: args.id,
    email,
    logger,
  });

  if (delivered) return;

  await failMessagingAction({
    actionId: args.id,
    logger,
    reason: "Failed to deliver NOTIFY_MESSAGING_CHANNEL notification",
  });
};

const reply: ActionFunction<{
  content?: string | null;
  cc?: string | null;
  bcc?: string | null;
  staticAttachments?: ActionItem["staticAttachments"];
}> = async ({
  client,
  email,
  args,
  userId,
  emailAccountId,
  executedRule,
  logger,
}) => {
  if (!args.content) return;

  const attachments = await resolveActionAttachments({
    email,
    emailAccountId,
    executedRule,
    userId,
    logger,
    staticAttachments: args.staticAttachments,
    includeAiSelectedAttachments: false,
  });

  await client.replyToEmail(
    {
      id: email.id,
      threadId: email.threadId,
      headers: email.headers,
      internalDate: email.internalDate,
      snippet: "",
      historyId: "",
      inline: [],
      subject: email.headers.subject,
      date: email.headers.date,
      textPlain: email.textPlain,
      textHtml: email.textHtml,
    },
    args.content,
    { attachments },
  );
};

const send_email: ActionFunction<{
  subject?: string | null;
  content?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
  staticAttachments?: ActionItem["staticAttachments"];
}> = async ({
  client,
  args,
  email,
  userId,
  emailAccountId,
  executedRule,
  logger,
}) => {
  if (!args.to || !args.subject || !args.content) return;

  const attachments = await resolveActionAttachments({
    email,
    emailAccountId,
    executedRule,
    userId,
    logger,
    staticAttachments: args.staticAttachments,
    includeAiSelectedAttachments: false,
  });

  const emailArgs = {
    to: args.to,
    cc: args.cc ?? undefined,
    bcc: args.bcc ?? undefined,
    subject: args.subject,
    messageText: args.content,
    attachments,
  };

  await client.sendEmail(emailArgs);
};

const forward: ActionFunction<{
  content?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
}> = async ({ client, email, args }) => {
  if (!args.to) return;

  const forwardArgs = {
    messageId: email.id,
    to: args.to,
    cc: args.cc ?? undefined,
    bcc: args.bcc ?? undefined,
    content: args.content ?? undefined,
  };

  await client.forwardEmail(
    {
      id: email.id,
      threadId: email.threadId,
      headers: email.headers,
      internalDate: email.internalDate,
      snippet: "",
      historyId: "",
      inline: [],
      subject: email.headers.subject,
      date: email.headers.date,
    },
    forwardArgs,
  );
};

const mark_spam: ActionFunction<Record<string, unknown>> = async ({
  client,
  email,
}) => {
  await client.markSpam(email.threadId);
};

const call_webhook: ActionFunction<{ url?: string | null }> = async ({
  email,
  args,
  userId,
  executedRule,
}) => {
  if (!args.url) return;

  const payload = {
    email: {
      threadId: email.threadId,
      messageId: email.id,
      subject: email.headers.subject,
      from: email.headers.from,
      cc: email.headers.cc,
      bcc: email.headers.bcc,
      headerMessageId: email.headers["message-id"] || "",
    },
    executedRule: {
      id: executedRule.id,
      ruleId: executedRule.ruleId,
      reason: executedRule.reason,
      automated: executedRule.automated,
      createdAt: executedRule.createdAt,
    },
  };

  await callWebhook(userId, args.url, payload);
};

const mark_read: ActionFunction<Record<string, unknown>> = async ({
  client,
  email,
}) => {
  await client.markRead(email.threadId);
};

const digest: ActionFunction<{ id?: string }> = async ({
  email,
  emailAccountId,
  args,
  logger,
}) => {
  if (!args.id) return;
  const actionId = args.id;
  await enqueueDigestItem({ email, emailAccountId, actionId, logger });
};

const move_folder: ActionFunction<{
  folderId?: string | null;
  folderName?: string | null;
}> = async ({ client, email, userEmail, emailAccountId, args, logger }) => {
  const originalFolderId = args.folderId;
  let folderIdToUse = originalFolderId;

  // resolve folder name to ID if needed (similar to label resolution)
  if (!folderIdToUse && args.folderName) {
    if (hasVariables(args.folderName)) {
      logger.error("Template folder name not processed by AI", {
        folderName: args.folderName,
      });
      return;
    }

    logger.info("Resolving folder name to ID", { folderName: args.folderName });
    folderIdToUse = await client.getOrCreateFolderIdByName(args.folderName);

    if (!folderIdToUse) {
      logger.error("Failed to resolve folder", { folderName: args.folderName });
      return;
    }
  }

  if (!folderIdToUse) return;

  await client.moveThreadToFolder(email.threadId, userEmail, folderIdToUse);

  // lazy-update the folderId in the database for future runs
  if (!originalFolderId && folderIdToUse && args.folderName) {
    after(() =>
      lazyUpdateActionFolderId({
        folderName: args.folderName!,
        folderId: folderIdToUse!,
        emailAccountId,
        logger,
      }),
    );
  }
};

const notify_sender: ActionFunction<Record<string, unknown>> = async ({
  email,
  emailAccountId,
  userEmail,
  logger,
}) => {
  const senderEmail = extractEmailAddress(email.headers.from);
  if (!senderEmail) {
    logger.error("Could not extract sender email for notify_sender action");
    return { success: false, errorCode: "MISSING_SENDER_EMAIL" };
  }

  const result = await sendColdEmailNotification({
    senderEmail,
    recipientEmail: userEmail,
    originalSubject: email.headers.subject,
    originalMessageId: email.headers["message-id"],
    logger,
  });

  if (!result.success) {
    const errorCode =
      result.error === "Resend not configured"
        ? "RESEND_NOT_CONFIGURED"
        : "SEND_FAILED";

    // Best-effort: don't fail the whole rule run if notification can't be sent.
    logger.error("Cold email notification failed", {
      error: result.error,
      errorCode,
    });
    logger.trace("Cold email notification failed sender", { senderEmail });

    captureException(
      new Error(result.error ?? "Cold email notification failed"),
      {
        emailAccountId,
        extra: { actionType: ActionType.NOTIFY_SENDER },
        sampleRate: 0.01,
      },
    );
    return { success: false, errorCode };
  }

  return { success: true };
};

async function lazyUpdateActionLabelId({
  labelName,
  labelId,
  emailAccountId,
  logger,
}: {
  labelName: string;
  labelId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  try {
    const result = await prisma.action.updateMany({
      where: {
        label: labelName,
        labelId: null,
        rule: { emailAccountId },
      },
      data: { labelId },
    });

    if (result.count > 0) {
      logger.info("Lazy-updated Action labelId", {
        labelId,
        updatedCount: result.count,
      });
    }
  } catch (error) {
    logger.warn("Failed to lazy-update Action labelId", {
      labelId,
      error,
    });
  }
}

async function lazyUpdateActionFolderId({
  folderName,
  folderId,
  emailAccountId,
  logger,
}: {
  folderName: string;
  folderId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  try {
    const result = await prisma.action.updateMany({
      where: {
        folderName,
        folderId: null,
        rule: { emailAccountId },
      },
      data: { folderId },
    });

    if (result.count > 0) {
      logger.info("Lazy-updated Action folderId", {
        folderId,
        updatedCount: result.count,
      });
    }
  } catch (error) {
    logger.warn("Failed to lazy-update Action folderId", {
      folderId,
      error,
    });
  }
}

async function failMessagingAction({
  actionId,
  logger,
  reason,
}: {
  actionId: string;
  logger: Logger;
  reason: string;
}): Promise<never> {
  try {
    await prisma.executedAction.update({
      where: { id: actionId },
      data: {
        messagingMessageStatus: MessagingMessageStatus.FAILED,
      },
    });
  } catch (error) {
    logger.warn("Failed to mark messaging action as failed", {
      actionId,
      error,
    });
  }

  throw new Error(reason);
}

function isLegacyMessagingDraft({
  executedRule,
  messagingChannelId,
}: {
  executedRule: ExecutedRuleForAction;
  messagingChannelId?: string | null;
}) {
  if (!messagingChannelId) return false;

  return !executedRule.actionItems?.some((action) =>
    isMessagingDraftActionType(action.type),
  );
}
