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
  labelThread,
  markReadThread,
} from "@/utils/gmail/label";
import { markSpam } from "@/utils/gmail/spam";
import type { Attachment } from "@/utils/types/mail";
import { createScopedLogger } from "@/utils/logger";
import { callWebhook } from "@/utils/webhook";
import type { Properties } from "@/utils/ai/types";
import type { ActionItem, EmailForAction } from "@/utils/ai/types";

const logger = createScopedLogger("ai-actions");

type ActionFunction<T extends Omit<ActionItem, "type" | "id">> = (
  gmail: gmail_v1.Gmail,
  email: EmailForAction,
  args: T,
  userEmail: string,
  executedRule: ExecutedRule,
) => Promise<any>;

type ActionFunctionDef = {
  name: string;
  description: string;
  parameters:
    | {
        type: string;
        properties: Properties;
        required: string[];
      }
    | { type: string; properties?: undefined; required: string[] };
  action: ActionType | null;
};

const ARCHIVE: ActionFunctionDef = {
  name: "archive",
  description: "Archive an email",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  action: ActionType.ARCHIVE,
};

const LABEL: ActionFunctionDef = {
  name: "label",
  description: "Label an email",
  parameters: {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "The name of the label.",
      },
    },
    required: ["label"],
  },
  action: ActionType.LABEL,
};

const DRAFT_EMAIL: ActionFunctionDef = {
  name: "draft",
  description: "Draft an email.",
  parameters: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "A comma separated list of the recipient email addresses.",
      },
      cc: {
        type: "string",
        description:
          "A comma separated list of email addresses of the cc recipients to send to.",
      },
      bcc: {
        type: "string",
        description:
          "A comma separated list of email addresses of the bcc recipients to send to.",
      },
      subject: {
        type: "string",
        description: "The subject of the email that is being drafted.",
      },
      content: {
        type: "string",
        description: "The content of the email that is being drafted.",
      },
    },
    required: ["content"],
  },
  action: ActionType.DRAFT_EMAIL,
};

const REPLY_TO_EMAIL: ActionFunctionDef = {
  name: "reply",
  description: "Reply to an email.",
  parameters: {
    type: "object",
    properties: {
      cc: {
        type: "string",
        description:
          "A comma separated list of email addresses of the cc recipients to send to.",
      },
      bcc: {
        type: "string",
        description:
          "A comma separated list of email addresses of the bcc recipients to send to.",
      },
      content: {
        type: "string",
        description: "The content to send in the reply.",
      },
    },
    required: ["to", "subject", "content"],
  },
  action: ActionType.REPLY,
};

const SEND_EMAIL: ActionFunctionDef = {
  name: "send_email",
  description: "Send an email.",
  parameters: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description: "Comma separated email addresses of the recipients.",
      },
      cc: {
        type: "string",
        description: "Comma separated email addresses of the cc recipients.",
      },
      bcc: {
        type: "string",
        description: "Comma separated email addresses of the bcc recipients.",
      },
      subject: {
        type: "string",
        description: "The subject of the email to be sent.",
      },
      content: {
        type: "string",
        description: "The content to send in the email.",
      },
    },
    required: ["to", "subject", "content"],
  },
  action: ActionType.SEND_EMAIL,
};

const FORWARD_EMAIL: ActionFunctionDef = {
  name: "forward",
  description: "Forward an email.",
  parameters: {
    type: "object",
    properties: {
      to: {
        type: "string",
        description:
          "Comma separated email addresses of the recipients to forward the email to.",
      },
      cc: {
        type: "string",
        description:
          "Comma separated email addresses of the cc recipients to forward the email to.",
      },
      bcc: {
        type: "string",
        description:
          "Comma separated email addresses of the bcc recipients to forward the email to.",
      },
      content: {
        type: "string",
        description: "Extra content to add to the forwarded email.",
      },
    },
    required: ["to"],
  },
  action: ActionType.FORWARD,
};

const MARK_SPAM: ActionFunctionDef = {
  name: "mark_spam",
  description: "Mark as spam.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  action: ActionType.MARK_SPAM,
};

const CALL_WEBHOOK: ActionFunctionDef = {
  name: "call_webhook",
  description: "Call a webhook.",
  parameters: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "The URL of the webhook to call.",
      },
    },
    required: ["url"],
  },
  action: ActionType.CALL_WEBHOOK,
};

const MARK_READ: ActionFunctionDef = {
  name: "mark_read",
  description: "Mark as read.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  action: ActionType.MARK_READ,
};

export const actionFunctionDefs: Record<ActionType, ActionFunctionDef> = {
  [ActionType.ARCHIVE]: ARCHIVE,
  [ActionType.LABEL]: LABEL,
  [ActionType.DRAFT_EMAIL]: DRAFT_EMAIL,
  [ActionType.REPLY]: REPLY_TO_EMAIL,
  [ActionType.SEND_EMAIL]: SEND_EMAIL,
  [ActionType.FORWARD]: FORWARD_EMAIL,
  [ActionType.MARK_SPAM]: MARK_SPAM,
  [ActionType.CALL_WEBHOOK]: CALL_WEBHOOK,
  [ActionType.MARK_READ]: MARK_READ,
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

  await labelThread({
    gmail,
    threadId: email.threadId,
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
  await draftEmail(gmail, email, args);
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

const mark_spam: ActionFunction<any> = async (
  gmail: gmail_v1.Gmail,
  email: EmailForAction,
) => {
  return await markSpam({ gmail, threadId: email.threadId });
};

const call_webhook: ActionFunction<any> = async (
  _gmail: gmail_v1.Gmail,
  email: EmailForAction,
  args: { url: string },
  userEmail: string,
  executedRule: ExecutedRule,
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

const mark_read: ActionFunction<any> = async (
  gmail: gmail_v1.Gmail,
  email: EmailForAction,
) => {
  return await markReadThread({ gmail, threadId: email.threadId, read: true });
};

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
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};
