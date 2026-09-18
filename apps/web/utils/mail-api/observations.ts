import type { MessageMetadata } from "@inboxzero/mail-core/messages";
import type { Provider } from "@inboxzero/mail-core/identities";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
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
    from: message.headers.from || "",
    to: splitAddresses(message.headers.to),
    cc: splitAddresses(message.headers.cc),
    receivedAtMs: receivedAtMs(message),
    read: !labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    folderId: message.parentFolderId ?? null,
    labelIds,
    categoryIds,
    roles,
    hasAttachments: Boolean(message.attachments?.length),
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
