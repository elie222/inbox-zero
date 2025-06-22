import {
  type Action,
  ActionType,
  type ExecutedAction,
  type Prisma,
} from "@prisma/client";

export const actionInputs: Record<
  ActionType,
  {
    fields: {
      name: "label" | "subject" | "content" | "to" | "cc" | "bcc" | "url";
      label: string;
      textArea?: boolean;
      expandable?: boolean;
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
  [ActionType.DIGEST]: { fields: [] },
  [ActionType.DRAFT_EMAIL]: {
    fields: [
      {
        name: "subject",
        label: "Subject",
        expandable: true,
      },
      {
        name: "content",
        label: "Content",
        textArea: true,
      },
      {
        name: "to",
        label: "To",
        expandable: true,
      },
      {
        name: "cc",
        label: "CC",
        expandable: true,
      },
      {
        name: "bcc",
        label: "BCC",
        expandable: true,
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
        expandable: true,
      },
      {
        name: "bcc",
        label: "BCC",
        expandable: true,
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
        expandable: true,
      },
      {
        name: "bcc",
        label: "BCC",
        expandable: true,
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
        expandable: true,
      },
      {
        name: "bcc",
        label: "BCC",
        expandable: true,
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
  [ActionType.MARK_READ]: { fields: [] },
  [ActionType.TRACK_THREAD]: { fields: [] },
};

export function getActionFields(fields: Action | ExecutedAction | undefined) {
  const res: {
    label?: string;
    subject?: string;
    content?: string;
    to?: string;
    cc?: string;
    bcc?: string;
    url?: string;
  } = {};

  // only return fields with a value
  if (fields?.label) res.label = fields.label;
  if (fields?.subject) res.subject = fields.subject;
  if (fields?.content) res.content = fields.content;
  if (fields?.to) res.to = fields.to;
  if (fields?.cc) res.cc = fields.cc;
  if (fields?.bcc) res.bcc = fields.bcc;
  if (fields?.url) res.url = fields.url;

  return res;
}

type ActionFieldsSelection = Pick<
  Prisma.ActionCreateInput,
  "type" | "label" | "subject" | "content" | "to" | "cc" | "bcc" | "url"
>;

export function sanitizeActionFields(
  action: Partial<ActionFieldsSelection> & { type: ActionType },
): ActionFieldsSelection {
  const base = {
    type: action.type,
    label: null,
    subject: null,
    content: null,
    to: null,
    cc: null,
    bcc: null,
    url: null,
  };

  switch (action.type) {
    case ActionType.ARCHIVE:
    case ActionType.MARK_SPAM:
    case ActionType.MARK_READ:
    case ActionType.TRACK_THREAD:
    case ActionType.DIGEST:
      return base;
    case ActionType.LABEL: {
      return {
        ...base,
        label: action.label ?? null,
      };
    }
    case ActionType.REPLY: {
      return {
        ...base,
        content: action.content ?? null,
        cc: action.cc ?? null,
        bcc: action.bcc ?? null,
      };
    }
    case ActionType.SEND_EMAIL: {
      return {
        ...base,
        subject: action.subject ?? null,
        content: action.content ?? null,
        to: action.to ?? null,
        cc: action.cc ?? null,
        bcc: action.bcc ?? null,
      };
    }
    case ActionType.FORWARD: {
      return {
        ...base,
        content: action.content ?? null,
        to: action.to ?? null,
        cc: action.cc ?? null,
        bcc: action.bcc ?? null,
      };
    }
    case ActionType.DRAFT_EMAIL: {
      return {
        ...base,
        subject: action.subject ?? null,
        content: action.content ?? null,
        to: action.to ?? null,
        cc: action.cc ?? null,
        bcc: action.bcc ?? null,
      };
    }
    case ActionType.CALL_WEBHOOK: {
      return {
        ...base,
        url: action.url ?? null,
      };
    }
    default:
      // biome-ignore lint/correctness/noSwitchDeclarations: intentional exhaustive check
      const exhaustiveCheck: never = action.type;
      return exhaustiveCheck;
  }
}
