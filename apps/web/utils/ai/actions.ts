import { type gmail_v1 } from "googleapis";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { draftEmail, sendEmail } from "@/utils/gmail/mail";
import { ActionType } from "@prisma/client";
import { PartialRecord } from "@/utils/types";
import { ActBodyWithHtml } from "@/app/api/ai/act/validation";
import { labelThread } from "@/utils/gmail/label";
import { getUserLabel } from "@/utils/label";
import { markSpam } from "@/utils/gmail/spam";

type ActionFunction = (
  gmail: gmail_v1.Gmail,
  email: ActBodyWithHtml["email"],
  args: any,
  userEmail: string,
) => Promise<any>;

type ActionFunctionDef = {
  action: ActionType | null;
  name: string;
  description: string;
  parameters: z.AnyZodObject;
  // | {
  //     type: string;
  //     properties: PartialRecord<
  //       "from" | "to" | "cc" | "bcc" | "subject" | "content" | "label",
  //       {
  //         type: string;
  //         description: string;
  //       }
  //     >;
  //     required: string[];
  //   }
  // | { type: string; properties?: undefined; required: string[] };
};

const ARCHIVE: ActionFunctionDef = {
  name: "archive",
  description: "Archive an email",
  parameters: z.object({}),
  action: ActionType.ARCHIVE,
};

const LABEL: ActionFunctionDef = {
  name: "label",
  description: "Label an email",
  parameters: z.object({
    label: z.string().describe("The name of the label."),
  }),
  action: ActionType.LABEL,
};

const DRAFT_EMAIL: ActionFunctionDef = {
  name: "draft",
  description: "Draft an email.",
  parameters: z.object({
    to: z
      .string()
      .optional()
      .describe("A comma separated list of the recipient email addresses."),
    cc: z
      .string()
      .optional()
      .describe(
        "A comma separated list of email addresses of the cc recipients to send to.",
      ),
    bcc: z
      .string()
      .optional()
      .describe(
        "A comma separated list of email addresses of the bcc recipients to send to.",
      ),
    subject: z
      .string()
      .optional()
      .describe("The subject of the email that is being drafted."),
    content: z
      .string()
      .describe("The content of the email that is being drafted."),
  }),
  action: ActionType.DRAFT_EMAIL,
};

const REPLY_TO_EMAIL: ActionFunctionDef = {
  name: "reply",
  description: "Reply to an email.",
  parameters: z.object({
    content: z.string().describe("The content to send in the reply."),
    cc: z
      .string()
      .optional()
      .describe(
        "A comma separated list of email addresses of the cc recipients to send to.",
      ),
    bcc: z
      .string()
      .optional()
      .describe(
        "A comma separated list of email addresses of the bcc recipients to send to.",
      ),
  }),
  action: ActionType.REPLY,
};

const SEND_EMAIL: ActionFunctionDef = {
  name: "send_email",
  description: "Send an email.",
  parameters: z.object({
    to: z
      .string()
      .describe("Comma separated email addresses of the recipients."),
    cc: z
      .string()
      .optional()
      .describe("Comma separated email addresses of the cc recipients."),
    bcc: z
      .string()
      .optional()
      .describe("Comma separated email addresses of the bcc recipients."),
    subject: z.string().describe("The subject of the email to be sent."),
    content: z.string().describe("The content to send in the email."),
  }),
  action: ActionType.SEND_EMAIL,
};

const FORWARD_EMAIL: ActionFunctionDef = {
  name: "forward",
  description: "Forward an email.",
  parameters: z.object({
    to: z
      .string()
      .describe("Comma separated email addresses of the recipients."),
    cc: z
      .string()
      .optional()
      .describe("Comma separated email addresses of the cc recipients."),
    bcc: z
      .string()
      .optional()
      .describe("Comma separated email addresses of the bcc recipients."),
    content: z
      .string()
      .optional()
      .describe("Extra content to add to the forwarded email."),
  }),
  action: ActionType.FORWARD,
};

const MARK_SPAM: ActionFunctionDef = {
  name: "mark_spam",
  description: "Mark as spam.",
  parameters: z.object({}),
  action: ActionType.MARK_SPAM,
};

export const actionFunctionDefs: Record<ActionType, ActionFunctionDef> = {
  [ActionType.ARCHIVE]: ARCHIVE,
  [ActionType.LABEL]: LABEL,
  [ActionType.DRAFT_EMAIL]: DRAFT_EMAIL,
  [ActionType.REPLY]: REPLY_TO_EMAIL,
  [ActionType.SEND_EMAIL]: SEND_EMAIL,
  [ActionType.FORWARD]: FORWARD_EMAIL,
  [ActionType.MARK_SPAM]: MARK_SPAM,
  // [ActionType.ADD_TO_DO]: ADD_TO_DO,
  // [ActionType.CALL_WEBHOOK]: CALL_WEBHOOK,
};

export function getJsonSchemaForAction(action: ActionType) {
  return zodToJsonSchema(actionFunctionDefs[action].parameters) as Record<
    string,
    any
  >;
}

export const actionFunctions: ActionFunctionDef[] = [
  ARCHIVE,
  LABEL,
  DRAFT_EMAIL,
  REPLY_TO_EMAIL,
  SEND_EMAIL,
  FORWARD_EMAIL,
];

const archive: ActionFunction = async (gmail, email) => {
  await gmail.users.threads.modify({
    userId: "me",
    id: email.threadId,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });
};

const label: ActionFunction = async (
  gmail,
  email,
  args: { label: string },
  userEmail,
) => {
  const label = await getUserLabel({
    gmail,
    email: userEmail,
    labelName: args.label,
  });

  if (!label?.id) return;

  await labelThread({
    gmail,
    threadId: email.threadId,
    labelId: label.id,
  });
};

const draft: ActionFunction = async (
  gmail,
  email,
  args: {
    to: string;
    subject: string;
    content: string;
  },
) => {
  await draftEmail(gmail, {
    subject: args.subject,
    messageText: args.content,
    to: args.to,
    replyToEmail: {
      threadId: email.threadId,
      references: email.references,
      headerMessageId: email.headerMessageId,
    },
  });
};

const send_email: ActionFunction = async (
  gmail,
  _email,
  args: {
    to: string;
    subject: string;
    content: string;
    cc: string;
    bcc: string;
  },
) => {
  await sendEmail(gmail, {
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    messageText: args.content,
  });
};

const reply: ActionFunction = async (
  gmail,
  email,
  args: {
    content: string;
    cc: string; // TODO - do we allow the ai to adjust this?
    bcc: string;
  },
) => {
  await sendEmail(gmail, {
    replyToEmail: {
      threadId: email.threadId,
      references: email.references,
      headerMessageId: email.headerMessageId,
    },
    to: email.replyTo || email.from,
    cc: args.cc,
    bcc: args.bcc,
    subject: email.subject,
    messageText: args.content,
  });
};

const forward: ActionFunction = async (
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
  // TODO handle HTML emails
  // TODO handle attachments
  await sendEmail(gmail, {
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    replyToEmail: {
      threadId: email.threadId,
      references: "",
      headerMessageId: "",
    },
    subject: `Fwd: ${email.subject}`,
    messageText: `${args.content ?? ""}

---------- Forwarded message ----------

From: ${email.from}

Date: ${email.date}

Subject: ${email.subject}

To: ${email.to}

${email.textHtml || email.textPlain}`,
  });
};

const mark_spam: ActionFunction = async (
  gmail: gmail_v1.Gmail,
  email: ActBodyWithHtml["email"],
) => {
  return await markSpam({ gmail, threadId: email.threadId });
};

// const add_to_do: ActionFunction = async (_gmail: gmail_v1.Gmail, args: { email_id: string, title: string }) => {};

// const call_webhook: ActionFunction = async (_gmail: gmail_v1.Gmail, args: { url: string, content: string }) => {};

export const ACTION_PROPERTIES = [
  "label",
  "to",
  "cc",
  "bcc",
  "subject",
  "content",
] as const;

export type ActionProperty = (typeof ACTION_PROPERTIES)[number];

export const runActionFunction = async (
  gmail: gmail_v1.Gmail,
  email: ActBodyWithHtml["email"],
  action: ActionType,
  args: PartialRecord<ActionProperty, string>,
  userEmail: string,
): Promise<any> => {
  switch (action) {
    case ActionType.ARCHIVE:
      return archive(gmail, email, args, userEmail);
    case ActionType.LABEL:
      return label(gmail, email, args, userEmail);
    case ActionType.DRAFT_EMAIL:
      return draft(gmail, email, args, userEmail);
    case ActionType.REPLY:
      return reply(gmail, email, args, userEmail);
    case ActionType.SEND_EMAIL:
      return send_email(gmail, email, args, userEmail);
    case ActionType.FORWARD:
      return forward(gmail, email, args, userEmail);
    case ActionType.MARK_SPAM:
      return mark_spam(gmail, email, args, userEmail);
    // case "ask_for_more_information":
    //   return;
    // case "add_to_do":
    //   return add_to_do;
    // case "call_webhook":
    //   return call_webhook;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};
