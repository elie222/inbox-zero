import { ActionType, type ExecutedRule } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { callWebhook } from "@/utils/webhook";
import type { ActionItem, EmailForAction } from "@/utils/ai/types";
import type { EmailProvider } from "@/utils/email/types";
import { enqueueDigestItem } from "@/utils/digest/index";
import { filterNullProperties } from "@/utils";

const logger = createScopedLogger("ai-actions");

type ActionFunction<T extends Partial<Omit<ActionItem, "type">>> = (options: {
  client: EmailProvider;
  email: EmailForAction;
  args: T;
  userEmail: string;
  userId: string;
  emailAccountId: string;
  executedRule: ExecutedRule;
}) => Promise<any>;

export const runActionFunction = async (options: {
  client: EmailProvider;
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
  logger.trace("Running action", () => filterNullProperties(action));

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
    case ActionType.DIGEST:
      return digest(opts);
    case ActionType.MOVE_FOLDER:
      return move_folder(opts);
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
}> = async ({ client, email, args }) => {
  let labelIdToUse = args.labelId;

  // Lazy migration: If no labelId but label name exists, look it up
  if (!labelIdToUse && args.label) {
    const matchingLabel = await client.getLabelByName(args.label);

    if (matchingLabel) {
      labelIdToUse = matchingLabel.id;
      // Note: We don't update the Action here to avoid race conditions
      // The Action will be migrated when the rule is next updated
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

  await client.labelMessage({
    messageId: email.id,
    labelId: labelIdToUse,
    labelName: args.label || null,
  });
};

const draft: ActionFunction<{
  subject?: string | null;
  content?: string | null;
  to?: string | null;
  cc?: string | null;
  bcc?: string | null;
}> = async ({ client, email, args, userEmail, executedRule }) => {
  const draftArgs = {
    to: args.to ?? undefined,
    subject: args.subject ?? undefined,
    content: args.content ?? "",
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

const reply: ActionFunction<{
  content?: string | null;
  cc?: string | null;
  bcc?: string | null;
}> = async ({ client, email, args }) => {
  if (!args.content) return;

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
    },
    args.content,
  );
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
}) => {
  if (!args.id) return;
  const actionId = args.id;
  await enqueueDigestItem({ email, emailAccountId, actionId });
};

const move_folder: ActionFunction<{ folderId?: string | null }> = async ({
  client,
  email,
  userEmail,
  args,
}) => {
  if (!args.folderId) return;
  await client.moveThreadToFolder(email.threadId, userEmail, args.folderId);
};
