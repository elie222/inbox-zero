import {
  MAX_ADDRESS_LENGTH,
  MAX_ATTACHMENT_CONTENT_ID_LENGTH,
  MAX_ATTACHMENT_FILENAME_LENGTH,
  MAX_ATTACHMENT_ID_LENGTH,
  MAX_ATTACHMENT_MIME_TYPE_LENGTH,
  MAX_MESSAGE_LABELS,
  MAX_MESSAGE_TEXT_LENGTH,
  MAX_RECIPIENTS,
  type MessageAttachmentDescriptor,
  type MessageMetadata,
} from "@inboxzero/mail-core/messages";
import type { Provider } from "@inboxzero/mail-core/identities";
import {
  type BodyObservation,
  bodyObservationSchema,
  MAX_BODY_ATTACHMENTS,
  MAX_BODY_LENGTH,
  type ProviderChange,
  providerChangeSchema,
} from "@inboxzero/mail-core/sync";
import { splitRecipientList } from "@/utils/email";
import { createScopedLogger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

const logger = createScopedLogger("mail-api/observations");

type MessagePatch = Extract<ProviderChange, { kind: "message_patch" }>;

const ROLE_LABELS = {
  INBOX: "inbox",
  SENT: "sent",
  DRAFT: "draft",
  TRASH: "trash",
  SPAM: "spam",
} as const;

export function parsedMessageMetadata(message: ParsedMessage): MessageMetadata {
  const labels = message.labelIds ?? [];
  const archived = labels.includes("ARCHIVE");
  const roles = [
    ...new Set([
      ...labels.flatMap((label) => {
        const role = ROLE_LABELS[label as keyof typeof ROLE_LABELS];
        return role ? [role] : [];
      }),
      ...rolesFromFolder(message.parentFolderId),
    ]),
  ].filter((role) => role !== "inbox" || !archived);
  const categoryIds = labels.filter((label) => label.startsWith("CATEGORY_"));
  const labelIds = labels.filter(
    (label) =>
      !(label in ROLE_LABELS) &&
      label !== "UNREAD" &&
      label !== "STARRED" &&
      label !== "IMPORTANT" &&
      !label.startsWith("CATEGORY_"),
  );
  // Sender-controlled text is cut to fit rather than rejected, so the message
  // still syncs with everything that does fit.
  return {
    subject: (message.subject || "").slice(0, MAX_MESSAGE_TEXT_LENGTH),
    preview: (message.snippet || "").slice(0, MAX_MESSAGE_TEXT_LENGTH),
    // A cut URL would point somewhere else, so an oversized one is dropped.
    externalUrl:
      message.externalUrl &&
      message.externalUrl.length <= MAX_MESSAGE_TEXT_LENGTH
        ? message.externalUrl
        : undefined,
    from: fitAddress(message.headers.from || ""),
    to: splitAddresses(message.headers.to),
    cc: splitAddresses(message.headers.cc),
    bcc: splitAddresses(message.headers.bcc),
    receivedAtMs: receivedAtMs(message),
    read: !labels.includes("UNREAD"),
    starred: labels.includes("STARRED"),
    folderId: message.parentFolderId ?? null,
    inboxSection: message.inboxSection ?? null,
    labelIds: labelIds.slice(0, MAX_MESSAGE_LABELS),
    categoryIds: categoryIds.slice(0, MAX_MESSAGE_LABELS),
    roles,
    hasAttachments:
      message.hasAttachment ?? Boolean(message.attachments?.length),
  };
}

export function parsedMessagePatch(
  accountId: string,
  provider: Provider,
  message: ParsedMessage,
): MessagePatch | null {
  return withinProtocolLimits(providerChangeSchema, accountId, message.id, {
    kind: "message_patch",
    key: { accountId, messageId: message.id },
    reference: {
      provider,
      messageId: message.id,
      conversationId: message.threadId,
      version: message.historyId || null,
    },
    fields: parsedMessageMetadata(message),
  });
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
  return withinProtocolLimits(bodyObservationSchema, accountId, message.id, {
    key: { accountId, messageId: message.id },
    version: message.historyId || null,
    html: message.textHtml?.slice(0, MAX_BODY_LENGTH) ?? null,
    text: message.textPlain?.slice(0, MAX_BODY_LENGTH) ?? null,
    attachments: attachments.slice(0, MAX_BODY_ATTACHMENTS),
    isMeetingInvitation,
  });
}

// Each response is validated as a whole, so one message the protocol cannot
// represent would fail its page on every retry and stall the account's sync.
// Fields that can be cut to fit already are; anything left (such as an
// oversized provider id) costs only that message.
function withinProtocolLimits<T>(
  schema: typeof providerChangeSchema | typeof bodyObservationSchema,
  accountId: string,
  messageId: string,
  observation: T,
): T | null {
  const parsed = schema.safeParse(observation);
  if (parsed.success) return observation;
  logger.error("Skipped message outside mail sync protocol limits", {
    emailAccountId: accountId,
    messageId,
    issues: parsed.error.issues.map(({ code, path }) => ({ code, path })),
  });
  return null;
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
  ].filter(
    // A provider part without a native or authoritative MIME reference, or
    // with one too long to request, cannot be retrieved.
    (descriptor) =>
      Boolean(descriptor.attachmentId) &&
      descriptor.attachmentId.length <= MAX_ATTACHMENT_ID_LENGTH,
  );
}

function descriptorFromParsed(
  attachment: {
    attachmentId: string;
    filename: string;
    mimeType: string;
    size: number;
    headers?: { "content-id"?: string };
  },
  inline: boolean,
): MessageAttachmentDescriptor {
  const contentId = attachment.headers?.["content-id"]
    ?.trim()
    .replace(/^<|>$/g, "");
  return {
    attachmentId: attachment.attachmentId,
    filename: attachment.filename.slice(0, MAX_ATTACHMENT_FILENAME_LENGTH),
    mimeType: attachment.mimeType.slice(0, MAX_ATTACHMENT_MIME_TYPE_LENGTH),
    size: Number.isFinite(attachment.size)
      ? Math.max(0, Math.trunc(attachment.size))
      : 0,
    inline,
    contentId:
      contentId && contentId.length <= MAX_ATTACHMENT_CONTENT_ID_LENGTH
        ? contentId
        : null,
  };
}

function receivedAtMs(message: ParsedMessage): number {
  if (message.internalDate) {
    const numeric = Number(message.internalDate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return Math.trunc(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric);
    }
  }
  const parsed = Date.parse(message.date);
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitAddresses(value: string | undefined): string[] {
  if (!value) return [];
  return splitRecipientList(value).slice(0, MAX_RECIPIENTS).map(fitAddress);
}

// Cutting from the end would drop a trailing <mailbox>, so an oversized
// display name gives way instead.
function fitAddress(address: string): string {
  if (address.length <= MAX_ADDRESS_LENGTH) return address;
  const mailboxStart = address.lastIndexOf("<");
  const mailbox =
    mailboxStart >= 0 && address.endsWith(">")
      ? address.slice(mailboxStart)
      : "";
  if (!mailbox || mailbox.length >= MAX_ADDRESS_LENGTH) {
    return address.slice(0, MAX_ADDRESS_LENGTH);
  }
  return `${address.slice(0, MAX_ADDRESS_LENGTH - mailbox.length - 1)} ${mailbox}`;
}

function rolesFromFolder(
  folderId: string | undefined,
): Array<"inbox" | "sent" | "draft" | "trash" | "spam"> {
  if (!folderId) return [];
  const folder = folderId.toLowerCase();
  // Folder ids are often opaque. A substring match treated archive folders
  // whose id happened to contain "inbox" as the inbox itself.
  if (folder === "inbox") return ["inbox"];
  if (folder.includes("sent")) return ["sent"];
  if (folder.includes("draft")) return ["draft"];
  if (folder.includes("deleted") || folder.includes("trash")) return ["trash"];
  if (folder.includes("junk") || folder.includes("spam")) return ["spam"];
  return [];
}
