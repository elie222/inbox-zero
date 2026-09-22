import type {
  MessageAttachmentDescriptor,
  MessageMetadata,
} from "@inboxzero/mail-core/messages";
import type { Provider } from "@inboxzero/mail-core/identities";
import type {
  BodyObservation,
  ProviderChange,
} from "@inboxzero/mail-core/sync";
import type { ParsedMessage } from "@/utils/types";

const ROLE_LABELS = {
  INBOX: "inbox",
  SENT: "sent",
  DRAFT: "draft",
  TRASH: "trash",
  SPAM: "spam",
} as const;

export function parsedMessageMetadata(message: ParsedMessage): MessageMetadata {
  const labels = message.labelIds ?? [];
  const roles = [
    ...new Set([
      ...labels.flatMap((label) => {
        const role = ROLE_LABELS[label as keyof typeof ROLE_LABELS];
        return role ? [role] : [];
      }),
      ...rolesFromFolder(message.parentFolderId),
    ]),
  ];
  const categoryIds = labels.filter((label) => label.startsWith("CATEGORY_"));
  const labelIds = labels.filter(
    (label) =>
      !(label in ROLE_LABELS) &&
      label !== "UNREAD" &&
      label !== "STARRED" &&
      label !== "IMPORTANT" &&
      !label.startsWith("CATEGORY_"),
  );
  return {
    subject: message.subject || "",
    preview: message.snippet || "",
    externalUrl: message.externalUrl ?? undefined,
    from: message.headers.from || "",
    to: splitAddresses(message.headers.to),
    cc: splitAddresses(message.headers.cc),
    receivedAtMs: receivedAtMs(message),
    read: !labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    folderId: message.parentFolderId ?? null,
    inboxSection: message.inboxSection ?? null,
    labelIds,
    categoryIds,
    roles,
    hasAttachments:
      message.hasAttachment ?? Boolean(message.attachments?.length),
  };
}

export function parsedMessagePatch(
  accountId: string,
  provider: Provider,
  message: ParsedMessage,
): ProviderChange {
  return {
    kind: "message_patch",
    key: { accountId, messageId: message.id },
    reference: {
      provider,
      messageId: message.id,
      conversationId: message.threadId,
      version: message.historyId || null,
    },
    fields: parsedMessageMetadata(message),
  };
}

export function parsedMessageBodyObservation(
  accountId: string,
  message: ParsedMessage,
): BodyObservation | null {
  const attachments = parsedMessageAttachmentDescriptors(message);
  const isMeetingInvitation = message.isMeetingInvitation === true;
  if (
    !message.textPlain &&
    !message.textHtml &&
    attachments.length === 0 &&
    !isMeetingInvitation
  ) {
    return null;
  }
  return {
    key: { accountId, messageId: message.id },
    version: message.historyId || null,
    html: message.textHtml ?? null,
    text: message.textPlain ?? null,
    attachments,
    isMeetingInvitation,
  };
}

function parsedMessageAttachmentDescriptors(
  message: ParsedMessage,
): MessageAttachmentDescriptor[] {
  return [
    ...(message.attachments ?? []).map((attachment) =>
      descriptorFromParsed(attachment, false),
    ),
    ...(message.inline ?? []).map((attachment) =>
      descriptorFromParsed(attachment, true),
    ),
  ];
}

function descriptorFromParsed(
  attachment: {
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
  },
  inline: boolean,
): MessageAttachmentDescriptor {
  return {
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: Number.isFinite(attachment.size) ? attachment.size : 0,
    inline,
  };
}

function receivedAtMs(message: ParsedMessage): number {
  if (message.internalDate) {
    const numeric = Number(message.internalDate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
  }
  const parsed = Date.parse(message.date);
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitAddresses(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function rolesFromFolder(
  folderId: string | undefined,
): Array<"inbox" | "sent" | "draft" | "trash" | "spam"> {
  if (!folderId) return [];
  const folder = folderId.toLowerCase();
  if (folder.includes("inbox")) return ["inbox"];
  if (folder.includes("sent")) return ["sent"];
  if (folder.includes("draft")) return ["draft"];
  if (folder.includes("deleted") || folder.includes("trash")) return ["trash"];
  if (folder.includes("junk") || folder.includes("spam")) return ["spam"];
  return [];
}
