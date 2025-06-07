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
// import type { Attachment } from "@/utils/types/mail";
import { createScopedLogger } from "@/utils/logger";
import { callWebhook } from "@/utils/webhook";
import type { ActionItem, EmailForAction } from "@/utils/ai/types";
import { coordinateReplyProcess } from "@/utils/reply-tracker/inbound";
import { internalDateToDate } from "@/utils/date";
import { handlePreviousDraftDeletion } from "@/utils/ai/choose-rule/draft-management";

const logger = createScopedLogger("ai-actions");

type ActionFunction<T extends Omit<ActionItem, "type" | "id">> = (options: {
  gmail: gmail_v1.Gmail;
  email: EmailForAction;
  args: T;
  userEmail: string;
  userId: string;
  emailAccountId: string;
  executedRule: ExecutedRule;
}) => Promise<any>;

export const runActionFunction = async (options: {
  gmail: gmail_v1.Gmail;
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
  gmail,
  email,
  userEmail,
}) => {
  await archiveThread({
    gmail,
    threadId: email.threadId,
    ownerEmail: userEmail,
    actionSource: "automation",
  });
};

const label: ActionFunction<{ label: string } | any> = async ({
  gmail,
  email,
  args,
}) => {
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

// args: {
//   to: string;
//   subject: string;
//   content: string;
//   attachments?: Attachment[];
// },
const draft: ActionFunction<any> = async ({
  gmail,
  email,
  args,
  executedRule,
}) => {
  // Run draft creation and previous draft deletion in parallel
  const [result] = await Promise.all([
    draftEmail(gmail, email, args),
    handlePreviousDraftDeletion({
      gmail,
      executedRule,
      logger,
    }),
  ]);

  return { draftId: result.data.message?.id };
};

// args: {
//   to: string;
//   subject: string;
//   content: string;
//   cc: string;
//   bcc: string;
//   attachments?: Attachment[];
// },
const send_email: ActionFunction<any> = async ({ gmail, args }) => {
  await sendEmailWithPlainText(gmail, {
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    messageText: args.content,
    attachments: args.attachments,
  });
};

// args: {
//   content: string;
//   cc?: string;
//   bcc?: string;
//   attachments?: Attachment[];
// },
const reply: ActionFunction<any> = async ({ gmail, email, args }) => {
  await replyToEmail(gmail, email, args.content, email.headers.from);
};

// args: {
//   to: string;
//   content: string;
//   cc: string;
//   bcc: string;
// },
const forward: ActionFunction<any> = async ({ gmail, email, args }) => {
  // We may need to make sure the AI isn't adding the extra forward content on its own
  await forwardEmail(gmail, {
    messageId: email.id,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    content: args.content,
  });
};

const mark_spam: ActionFunction<any> = async ({ gmail, email }) => {
  return await markSpam({ gmail, threadId: email.threadId });
};

// args: { url: string },
const call_webhook: ActionFunction<any> = async ({
  email,
  args,
  userId,
  executedRule,
}) => {
  await callWebhook(userId, args.url, {
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

const mark_read: ActionFunction<any> = async ({ gmail, email }) => {
  return await markReadThread({ gmail, threadId: email.threadId, read: true });
};

const track_thread: ActionFunction<any> = async ({
  gmail,
  email,
  emailAccountId,
}) => {
  await coordinateReplyProcess({
    emailAccountId,
    threadId: email.threadId,
    messageId: email.id,
    sentAt: internalDateToDate(email.internalDate),
    gmail,
  }).catch((error) => {
    logger.error("Failed to create reply tracker", { error });
  });
};
