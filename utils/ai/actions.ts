import { type gmail_v1 } from "googleapis";
import { draftEmail } from "@/app/api/google/draft/controller";
import { sendEmail } from "@/app/api/google/messages/send/controller";
import { ActionType } from "@prisma/client";
import { PartialRecord } from "@/utils/types";

export type ActionArgs = any;
export type ActionFunction = (
  gmail: gmail_v1.Gmail,
  args: ActionArgs
) => Promise<any>;
export type Actions =
  | "archive"
  | "label"
  | "draft"
  | "reply"
  | "send_email"
  | "forward"
  | "ask_for_more_information"; // | "add_to_do" | "call_webhook"; // "snooze" - in the future as gmail doesn't provide an api we'd have to build that ourselves

const customActions = [
  { action: ActionType.ARCHIVE, data: {} },
  { action: ActionType.LABEL, data: { label: "test" } },
  { action: ActionType.DRAFT_EMAIL, data: { content: "test" } },
  { action: ActionType.REPLY, data: { content: "test" } },
  { action: ActionType.SEND_EMAIL, data: { content: "test" } },
  { action: ActionType.FORWARD, data: { content: "test" } },
  // {action: ActionType.ASK_FOR_MORE_INFORMATION, data: {}},
];

// const actions = {
//   archive: {
//     name: "archive",
//     description: "Archive an email",

//   }
// }

const commonProperties = {
  // ruleNumber: {
  //   type: "number",
  //   description: "The rule number.",
  // },
  // nextAction: {
  //   type: "string",
  //   description: "The next action to apply (if there is one).",
  // },
};
const commonRequired = ["ruleNumber"];

type ActionFunctionDef = {
  name: Actions;
  description: string;
  parameters: {
    type: string;
    properties: PartialRecord<
      | "from"
      | "to"
      | "cc"
      | "bcc"
      | "subject"
      | "content"
      | "email_id"
      | "label"
      | "reply_to_email_id",
      {
        type: string;
        description: string;
      }
    >;
    required: string[];
  };
  action: ActionType | null;
};

const ASK_FOR_MORE_INFORMATION: ActionFunctionDef = {
  name: "ask_for_more_information",
  description: "Ask for more information on how to handle the email.",
  parameters: {
    type: "object",
    properties: {
      from: {
        type: "string",
        description: "The email address of the sender.",
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
    required: [],
  },
  action: null,
};

const ARCHIVE: ActionFunctionDef = {
  name: "archive",
  description: "Archive an email",
  parameters: {
    type: "object",
    properties: {
      ...commonProperties,
      email_id: {
        type: "string",
        description: "The id of the email.",
      },
    },
    required: [...commonRequired, "id"],
  },
  action: ActionType.ARCHIVE,
};

const LABEL: ActionFunctionDef = {
  name: "label",
  description: "Label an email",
  parameters: {
    type: "object",
    properties: {
      ...commonProperties,
      email_id: {
        type: "string",
        description: "The id of the email.",
      },
      label: {
        type: "string",
        description: "The name of the label.",
      },
    },
    required: [...commonRequired, "id", "label"],
  },
  action: ActionType.LABEL,
};

const DRAFT_EMAIL: ActionFunctionDef = {
  name: "draft",
  description: "Draft an email.",
  parameters: {
    type: "object",
    properties: {
      ...commonProperties,
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
    required: [...commonRequired, "content"],
  },
  action: ActionType.DRAFT_EMAIL,
};

const REPLY_TO_EMAIL: ActionFunctionDef = {
  name: "reply",
  description: "Reply to an email.",
  parameters: {
    type: "object",
    properties: {
      ...commonProperties,
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
    required: [
      ...commonRequired,
      "reply_to_email_id",
      "to",
      "subject",
      "content",
    ],
  },
  action: ActionType.REPLY,
};

const SEND_EMAIL: ActionFunctionDef = {
  name: "send_email",
  description: "Send an email.",
  parameters: {
    type: "object",
    properties: {
      ...commonProperties,
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
    required: [...commonRequired, "to", "subject", "content"],
  },
  action: ActionType.SEND_EMAIL,
};

const FORWARD_EMAIL: ActionFunctionDef = {
  name: "forward",
  description: "Forward an email.",
  parameters: {
    type: "object",
    properties: {
      ...commonProperties,
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
    required: [...commonRequired, "email_id", "to"],
  },
  action: ActionType.FORWARD,
};

export const actionFunctionDefs: Record<ActionType, ActionFunctionDef> = {
  [ActionType.ARCHIVE]: ARCHIVE,
  [ActionType.LABEL]: LABEL,
  [ActionType.DRAFT_EMAIL]: DRAFT_EMAIL,
  [ActionType.REPLY]: REPLY_TO_EMAIL,
  [ActionType.SEND_EMAIL]: SEND_EMAIL,
  [ActionType.FORWARD]: FORWARD_EMAIL,
  [ActionType.SUMMARIZE]: {} as any,
  [ActionType.MARK_SPAM]: {} as any,
  // [ActionType.ADD_TO_DO]: ADD_TO_DO,
  // [ActionType.CALL_WEBHOOK]: CALL_WEBHOOK,
  // ASK_FOR_MORE_INFORMATION
};

export const actionFunctions: ActionFunctionDef[] = [
  ASK_FOR_MORE_INFORMATION,
  ARCHIVE,
  LABEL,
  DRAFT_EMAIL,
  REPLY_TO_EMAIL,
  SEND_EMAIL,
  FORWARD_EMAIL,
  // {
  //   name: "add_to_do",
  //   description:
  //     "Add an task to the to do list.",
  //   parameters: {
  //     type: "object",
  //     properties: {
  //       ...commonProperties,
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
  //     required: [...commonRequired, "email_id", "title"],
  //   },
  // },
  // {
  //   name: "call_webhook",
  //   description:
  //     "Call a webhook.",
  //   parameters: {
  //     type: "object",
  //     properties: {
  //       ...commonProperties,
  //       url: {
  //         type: "string",
  //         description: "The url of the webhook to call.",
  //       },
  //       content: {
  //         type: "string",
  //         description: "Extra content for the task.",
  //       },
  //     },
  //     required: [...commonRequired, "email_id", "title"],
  //   },
  // },
];

const archive: ActionFunction = async (
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

const label: ActionFunction = async (
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

const draft: ActionFunction = async (
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

const send_email: ActionFunction = async (
  gmail: gmail_v1.Gmail,
  args: {
    to: string;
    subject: string;
    content: string;
    cc: string;
    bcc: string;
  }
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
  gmail: gmail_v1.Gmail,
  args: {
    reply_to_email_id: string;
    to: string;
    subject: string;
    content: string;
    cc: string;
    bcc: string;
  }
) => {
  await sendEmail(gmail, {
    threadId: args.reply_to_email_id,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    messageText: args.content,
  });
};

const forward: ActionFunction = async (
  gmail: gmail_v1.Gmail,
  args: {
    forward_email_id: string;
    to: string;
    subject: string;
    content: string;
    cc: string;
    bcc: string;
  }
) => {
  // TODO - is there anything forward specific we need to do here?
  await sendEmail(gmail, {
    threadId: args.forward_email_id,
    to: args.to,
    cc: args.cc,
    bcc: args.bcc,
    subject: args.subject,
    messageText: args.content,
  });
};

// const add_to_do: ActionFunction = async (_gmail: gmail_v1.Gmail, args: { email_id: string, title: string }) => {};

// const call_webhook: ActionFunction = async (_gmail: gmail_v1.Gmail, args: { url: string, content: string }) => {};

export const runActionFunction = (
  gmail: gmail_v1.Gmail,
  action: string,
  args: any
) => {
  switch (action) {
    case "archive":
      return archive(gmail, args);
    case "label":
      return label(gmail, args);
    case "draft":
      return draft(gmail, args);
    case "reply":
      return reply(gmail, args);
    case "send_email":
      return send_email(gmail, args);
    case "forward":
      return forward(gmail, args);
    case "ask_for_more_information":
      return;
    // case "add_to_do":
    //   return add_to_do;
    // case "call_webhook":
    //   return call_webhook;
    default:
      throw new Error(`Unknown action: ${action}`);
  }
};
