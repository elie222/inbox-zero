import { type Action, ActionType, type ExecutedAction } from "@prisma/client";

export const actionInputs: Record<
  ActionType,
  {
    fields: {
      name: "label" | "subject" | "content" | "to" | "cc" | "bcc" | "url";
      label: string;
      textArea?: boolean;
    }[];
  }
> = {
  [ActionType.ARCHIVE]: { fields: [] },
  [ActionType.LABEL]: {
    fields: [
      {
        name: "label",
        label: "Label",
      },
    ],
  },
  [ActionType.DRAFT_EMAIL]: {
    fields: [
      {
        name: "subject",
        label: "Subject",
      },
      {
        name: "content",
        label: "Content",
        textArea: true,
      },
      {
        name: "to",
        label: "To",
      },
      {
        name: "cc",
        label: "CC",
      },
      {
        name: "bcc",
        label: "BCC",
      },
    ],
  },
  [ActionType.REPLY]: {
    fields: [
      {
        name: "content",
        label: "Content",
        textArea: true,
      },
      {
        name: "cc",
        label: "CC",
      },
      {
        name: "bcc",
        label: "BCC",
      },
    ],
  },
  [ActionType.SEND_EMAIL]: {
    fields: [
      {
        name: "subject",
        label: "Subject",
      },
      {
        name: "content",
        label: "Content",
        textArea: true,
      },
      {
        name: "to",
        label: "To",
      },
      {
        name: "cc",
        label: "CC",
      },
      {
        name: "bcc",
        label: "BCC",
      },
    ],
  },
  [ActionType.FORWARD]: {
    fields: [
      {
        name: "content",
        label: "Extra Content",
        textArea: true,
      },
      {
        name: "to",
        label: "To",
      },
      {
        name: "cc",
        label: "CC",
      },
      {
        name: "bcc",
        label: "BCC",
      },
    ],
  },
  [ActionType.MARK_SPAM]: { fields: [] },
  [ActionType.CALL_WEBHOOK]: {
    fields: [
      {
        name: "url",
        label: "URL",
      },
    ],
  },
};

export function getActionFields(fields: Action | ExecutedAction | undefined) {
  const res: {
    label?: string;
    subject?: string;
    content?: string;
    to?: string;
    cc?: string;
    bcc?: string;
  } = {};

  // only return fields with a value
  if (fields?.label) res.label = fields.label;
  if (fields?.subject) res.subject = fields.subject;
  if (fields?.content) res.content = fields.content;
  if (fields?.to) res.to = fields.to;
  if (fields?.cc) res.cc = fields.cc;
  if (fields?.bcc) res.bcc = fields.bcc;

  return res;
}
