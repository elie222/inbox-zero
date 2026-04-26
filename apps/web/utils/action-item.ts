import { ActionType } from "@/generated/prisma/enums";
import type { Action, ExecutedAction, Prisma } from "@/generated/prisma/client";

const DRAFT_REPLY_FIELDS = [
  { name: "subject" as const, label: "Subject", expandable: true },
  { name: "content" as const, label: "Content", textArea: true },
  { name: "to" as const, label: "To", expandable: true },
  { name: "cc" as const, label: "CC", expandable: true },
  { name: "bcc" as const, label: "BCC", expandable: true },
];

export const actionInputs: Record<
  ActionType,
  {
    fields: {
      name:
        | "labelId"
        | "subject"
        | "content"
        | "to"
        | "cc"
        | "bcc"
        | "url"
        | "folderName"
        | "folderId";
      label: string;
      textArea?: boolean;
      expandable?: boolean;
      placeholder?: string;
    }[];
  }
> = {
  [ActionType.ARCHIVE]: { fields: [] },
  [ActionType.LABEL]: {
    fields: [
      {
        name: "labelId",
        label: "Label",
      },
    ],
  },
  [ActionType.DIGEST]: { fields: [] },
  [ActionType.DRAFT_EMAIL]: { fields: DRAFT_REPLY_FIELDS },
  [ActionType.DRAFT_MESSAGING_CHANNEL]: { fields: DRAFT_REPLY_FIELDS },
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
        name: "to",
        label: "To",
      },
      {
        name: "content",
        label: "Extra Content",
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
  [ActionType.MARK_SPAM]: { fields: [] },
  [ActionType.CALL_WEBHOOK]: {
    fields: [
      {
        name: "url",
        label: "Webhook URL",
        placeholder: "https://example.com/webhook",
      },
    ],
  },
  [ActionType.MARK_READ]: { fields: [] },
  [ActionType.MOVE_FOLDER]: {
    fields: [
      {
        name: "folderName",
        label: "Folder name",
      },
    ],
  },
  [ActionType.NOTIFY_MESSAGING_CHANNEL]: {
    fields: [],
  },
  [ActionType.NOTIFY_SENDER]: {
    fields: [],
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
    url?: string;
    folderName?: string;
    folderId?: string;
  } = {};

  // only return fields with a value
  if (fields?.label) res.label = fields.label;
  if (fields?.subject) res.subject = fields.subject;
  if (fields?.content) res.content = fields.content;
  if (fields?.to) res.to = fields.to;
  if (fields?.cc) res.cc = fields.cc;
  if (fields?.bcc) res.bcc = fields.bcc;
  if (fields?.url) res.url = fields.url;
  if (fields?.folderName) res.folderName = fields.folderName;
  if (fields?.folderId) res.folderId = fields.folderId;

  return res;
}

type ActionFieldsSelection = {
  type: ActionType;
  label: string | null;
  labelId: string | null;
  messagingChannelId: string | null;
  subject: string | null;
  content: string | null;
  to: string | null;
  cc: string | null;
  bcc: string | null;
  url: string | null;
  folderName: string | null;
  folderId: string | null;
  delayInMinutes: number | null;
  staticAttachments?: Prisma.JsonValue;
};

type SanitizableActionFields = Partial<
  Omit<ActionFieldsSelection, "staticAttachments">
> & {
  type: ActionType;
  staticAttachments?: Prisma.JsonValue | null;
};

export function sanitizeActionFields(
  action: SanitizableActionFields,
): ActionFieldsSelection {
  const supportsStaticAttachments =
    action.type === ActionType.DRAFT_EMAIL ||
    action.type === ActionType.DRAFT_MESSAGING_CHANNEL ||
    action.type === ActionType.REPLY ||
    action.type === ActionType.SEND_EMAIL;

  const base: ActionFieldsSelection = {
    type: action.type,
    label: null,
    labelId: null,
    messagingChannelId: null,
    subject: null,
    content: null,
    to: null,
    cc: null,
    bcc: null,
    url: null,
    folderName: null,
    folderId: null,
    delayInMinutes: action.delayInMinutes || null,
    staticAttachments: supportsStaticAttachments
      ? (action.staticAttachments ?? undefined)
      : undefined,
  };

  switch (action.type) {
    case ActionType.ARCHIVE:
    case ActionType.MARK_SPAM:
    case ActionType.MARK_READ:
    case ActionType.DIGEST:
      return base;
    case ActionType.MOVE_FOLDER: {
      return {
        ...base,
        folderName: action.folderName ?? null,
        folderId: action.folderId ?? null,
      };
    }
    case ActionType.LABEL: {
      return {
        ...base,
        label: action.label ?? null,
        labelId: action.labelId ?? null,
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
    case ActionType.DRAFT_EMAIL:
    case ActionType.DRAFT_MESSAGING_CHANNEL: {
      return {
        ...base,
        messagingChannelId: action.messagingChannelId ?? null,
        subject: action.subject ?? null,
        content: action.content ?? null,
        to: action.to ?? null,
        cc: action.cc ?? null,
        bcc: action.bcc ?? null,
      };
    }
    case ActionType.NOTIFY_MESSAGING_CHANNEL: {
      return {
        ...base,
        messagingChannelId: action.messagingChannelId ?? null,
      };
    }
    case ActionType.CALL_WEBHOOK: {
      return {
        ...base,
        url: action.url ?? null,
      };
    }
    case ActionType.NOTIFY_SENDER: {
      return base;
    }
    default:
      // biome-ignore lint/correctness/noSwitchDeclarations: intentional exhaustive check
      const exhaustiveCheck: never = action.type;
      return exhaustiveCheck;
  }
}
