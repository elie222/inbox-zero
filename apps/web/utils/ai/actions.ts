import type { gmail_v1 } from "@googleapis/gmail";
import {
  draftEmail as gmailDraftEmail,
  forwardEmail as gmailForwardEmail,
  replyToEmail as gmailReplyToEmail,
  sendEmailWithPlainText as gmailSendEmailWithPlainText,
} from "@/utils/gmail/mail";
import {
  draftEmail as outlookDraftEmail,
  forwardEmail as outlookForwardEmail,
  replyToEmail as outlookReplyToEmail,
  sendEmailWithPlainText as outlookSendEmailWithPlainText,
} from "@/utils/outlook/mail";
import { ActionType, type ExecutedRule } from "@prisma/client";
import {
  archiveThread as gmailArchiveThread,
  getOrCreateLabel as gmailGetOrCreateLabel,
  labelMessage as gmailLabelMessage,
  markReadThread as gmailMarkReadThread,
} from "@/utils/gmail/label";
import {
  archiveThread as outlookArchiveThread,
  getOrCreateLabel as outlookGetOrCreateLabel,
  labelMessage as outlookLabelMessage,
  markReadThread as outlookMarkReadThread,
} from "@/utils/outlook/label";
import { markSpam as gmailMarkSpam } from "@/utils/gmail/spam";
import { markSpam as outlookMarkSpam } from "@/utils/outlook/spam";
import { createScopedLogger } from "@/utils/logger";
import { callWebhook } from "@/utils/webhook";
import type { ActionItem, EmailForAction } from "@/utils/ai/types";
import { coordinateReplyProcess } from "@/utils/reply-tracker/inbound";
import { internalDateToDate } from "@/utils/date";
import { handlePreviousDraftDeletion } from "@/utils/ai/choose-rule/draft-management";
import type { OutlookClient } from "@/utils/outlook/client";

const logger = createScopedLogger("ai-actions");

type EmailClient = gmail_v1.Gmail | OutlookClient;

function isGmailClient(client: EmailClient): client is gmail_v1.Gmail {
  return "users" in client;
}

type ActionFunction<T extends Partial<Omit<ActionItem, "type" | "id">>> =
  (options: {
    client: EmailClient;
    email: EmailForAction;
    args: T;
    userEmail: string;
    userId: string;
    emailAccountId: string;
    executedRule: ExecutedRule;
  }) => Promise<any>;

export const runActionFunction = async (options: {
  client: EmailClient;
  email: EmailForAction;
  action: ActionItem;
  userEmail: string;
  userId: string;
  emailAccountId: string;
  executedRule: ExecutedRule;
}) => {
  const { action, userEmail } = options;
  logger.info("Running action", {
    actionType: action.type,
    userEmail,
    id: action.id,
  });
  logger.trace("Running action:", action);

  const { type, ...args } = action;
  const opts = {
    ...options,
    args,
  };
  switch (type) {
    case ActionType.ARCHIVE:
      return archive(opts);
    case ActionType.LABEL:
      return label(opts);
    case ActionType.DRAFT_EMAIL:
      return draft(opts);
    case ActionType.REPLY:
      return reply(opts);
    case ActionType.SEND_EMAIL:
      return send_email(opts);
    case ActionType.FORWARD:
      return forward(opts);
    case ActionType.MARK_SPAM:
      return mark_spam(opts);
    case ActionType.CALL_WEBHOOK:
      return call_webhook(opts);
    case ActionType.MARK_READ:
      return mark_read(opts);
    case ActionType.TRACK_THREAD:
      return track_thread(opts);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

const archive: ActionFunction<Record<string, unknown>> = async ({
  client,
  email,
  userEmail,
}) => {
  if (isGmailClient(client)) {
    await gmailArchiveThread({
      gmail: client,
      threadId: email.threadId,
      ownerEmail: userEmail,
      actionSource: "automation",
    });
  } else {
    await outlookArchiveThread({ client, threadId: email.threadId });
  }
};

const label: ActionFunction<{ label?: string | null }> = async ({
  client,
  email,
  args,
}) => {
  if (!args.label) return;

  if (isGmailClient(client)) {
    const label = await gmailGetOrCreateLabel({
      gmail: client,
      name: args.label,
    });
    if (!label.id)
      throw new Error("Label not found and unable to create label");
    await gmailLabelMessage({
      gmail: client,
      messageId: email.id,
      addLabelIds: [label.id],
    });
  } else {
    const label = await outlookGetOrCreateLabel({
      client,
      name: args.label,
    });
    await outlookLabelMessage({
      client,
      messageId: email.id,
      categories: [label.displayName || ""],
    });
  }
};

const draft: ActionFunction<{
  subject?: string | null;
  content?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
}> = async ({ client, email, args, executedRule }) => {
  const draftArgs = {
    to: args.to ?? undefined,
    subject: args.subject ?? undefined,
    content: args.content ?? "",
  };

  if (isGmailClient(client)) {
    // Run draft creation and previous draft deletion in parallel
    const [result] = await Promise.all([
      gmailDraftEmail(client, email, draftArgs),
      handlePreviousDraftDeletion({
        gmail: client,
        executedRule,
        logger,
      }),
    ]);
    return { draftId: result.data.message?.id };
  } else {
    const result = await outlookDraftEmail(client, email, draftArgs);
    return { draftId: result.id };
  }
};

const reply: ActionFunction<{
  content?: string | null;
  cc?: string | null;
  bcc?: string | null;
}> = async ({ client, email, args, userEmail, userId, emailAccountId }) => {
  if (!args.content) return;

  if (isGmailClient(client)) {
    await gmailReplyToEmail(client, email, args.content);
  } else {
    await outlookReplyToEmail(client, email, args.content);
  }

  await coordinateReplyProcess({
    threadId: email.threadId,
    messageId: email.id,
    emailAccountId,
    sentAt: internalDateToDate(email.internalDate),
    client,
  });
};

const send_email: ActionFunction<{
  subject?: string | null;
  content?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
}> = async ({ client, args }) => {
  if (!args.to || !args.subject || !args.content) return;

  const emailArgs = {
    to: args.to,
    cc: args.cc ?? undefined,
    bcc: args.bcc ?? undefined,
    subject: args.subject,
    messageText: args.content,
  };

  if (isGmailClient(client)) {
    await gmailSendEmailWithPlainText(client, emailArgs);
  } else {
    await outlookSendEmailWithPlainText(client, emailArgs);
  }
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

  if (isGmailClient(client)) {
    await gmailForwardEmail(client, forwardArgs);
  } else {
    await outlookForwardEmail(client, forwardArgs);
  }
};

const mark_spam: ActionFunction<Record<string, unknown>> = async ({
  client,
  email,
}) => {
  if (isGmailClient(client)) {
    return await gmailMarkSpam({ gmail: client, threadId: email.threadId });
  } else {
    return await outlookMarkSpam(client, email.threadId);
  }
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
  if (isGmailClient(client)) {
    await gmailMarkReadThread({
      gmail: client,
      threadId: email.threadId,
      read: true,
    });
  } else {
    await outlookMarkReadThread({
      client,
      threadId: email.threadId,
      read: true,
    });
  }
};

const track_thread: ActionFunction<Record<string, unknown>> = async ({
  client,
  email,
  userEmail,
  userId,
  emailAccountId,
}) => {
  await coordinateReplyProcess({
    threadId: email.threadId,
    messageId: email.id,
    emailAccountId,
    sentAt: internalDateToDate(email.internalDate),
    client,
  });
};
