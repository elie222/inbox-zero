import { ActionType } from "@prisma/client";

export const actionInputs: Record<
  ActionType,
  {
    fields: {
      name: "label" | "subject" | "content" | "to" | "cc" | "bcc";
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
  [ActionType.SUMMARIZE]: { fields: [] },
  [ActionType.MARK_SPAM]: { fields: [] },
};
