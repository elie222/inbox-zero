import { draftEmail } from "@/app/api/google/draft/route";
import { sendEmail } from "@/app/api/google/messages/send/controller";
import { gmail_v1 } from "googleapis";

export type ActionArgs = any;
export type ActionFunction = (
  gmail: gmail_v1.Gmail,
  args: ActionArgs
) => Promise<any>;
export type Actions = "archive" | "label" | "draft" | "send_email" | "forward"; // | "add_to_do" | "call_webhook"; // "snooze" - in the future as gmail doesn't provide an api we'd have to build that ourselves

export const actionFunctions: {
  name: Actions;
  description: string;
  parameters: object;
}[] = [
  {
    name: "archive",
    description: "Archive an email",
    parameters: {
      type: "object",
      properties: {
        email_id: {
          type: "string",
          description: "The id of the email.",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "label",
    description: "Label an email",
    parameters: {
      type: "object",
      properties: {
        email_id: {
          type: "string",
          description: "The id of the email.",
        },
        label: {
          type: "string",
          description: "The name of the label.",
        },
      },
      required: ["id", "label"],
    },
  },
  {
    name: "draft",
    description: "Draft an email.",
    parameters: {
      type: "object",
      properties: {
        reply_to_email_id: {
          type: "string",
          description: "The id of the email to reply to.",
        },
        to: {
          type: "string",
          description: "The email address of the recipient.",
        },
        subject: {
          type: "string",
          description: "The subject of the email.",
        },
        content: {
          type: "string",
          description: "The content of the email.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "send_email",
    description: "Send an email.",
    parameters: {
      type: "object",
      properties: {
        reply_to_email_id: {
          type: "string",
          description: "The id of the email to reply to.",
        },
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
          description: "The subject of the email.",
        },
        content: {
          type: "string",
          description: "The content of the email.",
        },
      },
      required: ["to", "subject", "content"],
    },
  },
  {
    name: "forward",
    description: "Forward an email.",
    parameters: {
      type: "object",
      properties: {
        email_id: {
          type: "string",
          description: "The id of the email to forward.",
        },
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
        subject: {
          type: "string",
          description: "The subject of the email.",
        },
        content: {
          type: "string",
          description: "Extra content to add to the forwarded email.",
        },
      },
      required: ["email_id", "to"],
    },
  },
  // {
  //   name: "add_to_do",
  //   description:
  //     "Add an task to the to do list.",
  //   parameters: {
  //     type: "object",
  //     properties: {
  //       email_id: {
  //         type: "string",
  //         description: "The id of the email to add as a to do.",
  //       },
  //       due_date: {
  //         type: "string",
  //         description: "The due date for the task.",
  //       },
  //       title: {
  //         type: "string",
  //         description: "The title of the task.",
  //       },
  //       content: {
  //         type: "string",
  //         description: "Extra content for the task.",
  //       },
  //       priority: {
  //         type: "number",
  //         description: "The priority of the task between 1 and 4 where 1 is the highest priority.",
  //       },
  //     },
  //     required: ["email_id", "title"],
  //   },
  // },
  // {
  //   name: "call_webhook",
  //   description:
  //     "Call a webhook.",
  //   parameters: {
  //     type: "object",
  //     properties: {
  //       url: {
  //         type: "string",
  //         description: "The url of the webhook to call.",
  //       },
  //       content: {
  //         type: "string",
  //         description: "Extra content for the task.",
  //       },
  //     },
  //     required: ["email_id", "title"],
  //   },
  // },
];

export const archive: ActionFunction = async (
  gmail: gmail_v1.Gmail,
  args: { email_id: string }
) => {
  await gmail.users.threads.modify({
    userId: "me",
    id: args.email_id,
    requestBody: {
      removeLabelIds: ["INBOX"],
    },
  });
};

export const label: ActionFunction = async (
  gmail: gmail_v1.Gmail,
  args: { email_id: string; label: string }
) => {
  await gmail.users.threads.modify({
    userId: "me",
    id: args.email_id,
    requestBody: {
      addLabelIds: [args.label],
    },
  });
};

export const draft: ActionFunction = async (
  gmail: gmail_v1.Gmail,
  args: {
    reply_to_email_id: string;
    to: string;
    subject: string;
    content: string;
  }
) => {
  await draftEmail(
    {
      subject: args.subject,
      body: args.content,
      to: args.to,
      threadId: args.reply_to_email_id, // TODO check this is accurate
    },
    gmail
  );
};

export const send_email: ActionFunction = async (
  _gmail: gmail_v1.Gmail,
  args: {
    reply_to_email_id: string;
    to: string;
    subject: string;
    content: string;
    cc: string;
    bcc: string;
  }
) => {
  await sendEmail({
    threadId: args.reply_to_email_id,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    message: args.content,
  });
};

export const forward: ActionFunction = async (
  _gmail: gmail_v1.Gmail,
  args: {
    reply_to_email_id: string;
    to: string;
    subject: string;
    content: string;
    cc: string;
    bcc: string;
  }
) => {
  // TODO - is there anything forward specific we need to do here?
  await sendEmail({
    threadId: args.reply_to_email_id,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    message: args.content,
  });
};

// export const add_to_do: ActionFunction = async (_gmail: gmail_v1.Gmail, args: { email_id: string, title: string }) => {};

// export const call_webhook: ActionFunction = async (_gmail: gmail_v1.Gmail, args: { url: string, content: string }) => {};

export const getActionFunction = (action: Actions): ActionFunction => {
  switch (action) {
    case "archive":
      return archive;
    case "label":
      return label;
    case "draft":
      return draft;
    case "send_email":
      return send_email;
    case "forward":
      return forward;
    // case "add_to_do":
    //   return add_to_do;
    // case "call_webhook":
    //   return call_webhook;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};
