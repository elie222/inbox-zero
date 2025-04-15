import type { gmail_v1 } from "@googleapis/gmail";
import {
  draftEmail,
  forwardEmail,
  replyToEmail,
  sendEmailWithPlainText,
} from "@/utils/gmail/mail";
import { ActionType, type ExecutedRule } from "@prisma/client";
import {
  archiveThread,
  getOrCreateLabel,
  labelMessage,
  markReadThread,
} from "@/utils/gmail/label";
import { markSpam } from "@/utils/gmail/spam";
import type { Attachment } from "@/utils/types/mail";
import { createScopedLogger } from "@/utils/logger";
import { callWebhook } from "@/utils/webhook";
import type { ActionItem, EmailForAction } from "@/utils/ai/types";
import { coordinateReplyProcess } from "@/utils/reply-tracker/inbound";
import { internalDateToDate } from "@/utils/date";

const logger = createScopedLogger("ai-actions");

type ActionFunction<T extends Omit<ActionItem, "type" | "id">> = (
  gmail: gmail_v1.Gmail,
  email: EmailForAction,
  args: T,
  userEmail: string,
  executedRule: ExecutedRule,
) => Promise<any>;

export const runActionFunction = async (
  gmail: gmail_v1.Gmail,
  email: EmailForAction,
  action: ActionItem,
  userEmail: string,
  executedRule: ExecutedRule,
) => {
  logger.info("Running action", {
    actionType: action.type,
    userEmail,
    id: action.id,
  });
  logger.trace("Running action:", action);

  const { type, ...args } = action;
  switch (type) {
    case ActionType.ARCHIVE:
      return archive(gmail, email, args, userEmail, executedRule);
    case ActionType.LABEL:
      return label(gmail, email, args, userEmail, executedRule);
    case ActionType.DRAFT_EMAIL:
      return draft(gmail, email, args, userEmail, executedRule);
    case ActionType.REPLY:
      return reply(gmail, email, args, userEmail, executedRule);
    case ActionType.SEND_EMAIL:
      return send_email(gmail, email, args, userEmail, executedRule);
    case ActionType.FORWARD:
      return forward(gmail, email, args, userEmail, executedRule);
    case ActionType.MARK_SPAM:
      return mark_spam(gmail, email, args, userEmail, executedRule);
    case ActionType.CALL_WEBHOOK:
      return call_webhook(gmail, email, args, userEmail, executedRule);
    case ActionType.MARK_READ:
      return mark_read(gmail, email, args, userEmail, executedRule);
    case ActionType.TRACK_THREAD:
      return track_thread(gmail, email, args, userEmail, executedRule);
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};

const archive: ActionFunction<Record<string, unknown>> = async (
  gmail,
  email,
  _args,
  userEmail,
) => {
  await archiveThread({
    gmail,
    threadId: email.threadId,
    ownerEmail: userEmail,
    actionSource: "automation",
  });
};

const label: ActionFunction<{ label: string } | any> = async (
  gmail,
  email,
  args,
) => {
  if (!args.label) return;

  const label = await getOrCreateLabel({
    gmail,
    name: args.label,
  });

  if (!label.id) throw new Error("Label not found and unable to create label");

  await labelMessage({
    gmail,
    messageId: email.id,
    addLabelIds: [label.id],
  });
};

const draft: ActionFunction<any> = async (
  gmail,
  email,
  args: {
    to: string;
    subject: string;
    content: string;
    attachments?: Attachment[];
  },
) => {
  const result = await draftEmail(gmail, email, args);
  return { draftId: result.data.message?.id };
};

const send_email: ActionFunction<any> = async (
  gmail,
  _email,
  args: {
    to: string;
    subject: string;
    content: string;
    cc: string;
    bcc: string;
    attachments?: Attachment[];
  },
) => {
  await sendEmailWithPlainText(gmail, {
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    messageText: args.content,
    attachments: args.attachments,
  });
};

const reply: ActionFunction<any> = async (
  gmail,
  email,
  args: {
    content: string;
    cc?: string;
    bcc?: string;
    attachments?: Attachment[];
  },
) => {
  await replyToEmail(gmail, email, args.content, email.headers.from);
};

const forward: ActionFunction<any> = async (
  gmail,
  email,
  args: {
    to: string;
    content: string;
    cc: string;
    bcc: string;
  },
) => {
  // We may need to make sure the AI isn't adding the extra forward content on its own
  await forwardEmail(gmail, {
    messageId: email.id,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    content: args.content,
  });
};

const mark_spam: ActionFunction<any> = async (gmail, email) => {
  return await markSpam({ gmail, threadId: email.threadId });
};

const call_webhook: ActionFunction<any> = async (
  _gmail,
  email,
  args: { url: string },
  userEmail,
  executedRule,
) => {
  await callWebhook(userEmail, args.url, {
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
  });
};

const mark_read: ActionFunction<any> = async (gmail, email) => {
  return await markReadThread({ gmail, threadId: email.threadId, read: true });
};

const track_thread: ActionFunction<any> = async (
  gmail,
  email,
  _args,
  userEmail,
  executedRule,
) => {
  await coordinateReplyProcess(
    executedRule.userId,
    userEmail,
    email.threadId,
    email.id,
    internalDateToDate(email.internalDate),
    gmail,
  ).catch((error) => {
    logger.error("Failed to create reply tracker", { error });
  });
};
