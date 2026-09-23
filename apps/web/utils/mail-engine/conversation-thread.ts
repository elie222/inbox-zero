import type { MessageAttachmentDescriptor } from "@inboxzero/mail-core/messages";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { ConversationView } from "@inboxzero/mail-core/ports/mail-store";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import { messageLabelIds } from "@/utils/mail-engine/list-thread";
import type { Attachment, ParsedMessage } from "@/utils/types";

export function conversationViewToThreadResponse(
  view: ConversationView,
  options?: { includeDrafts?: boolean },
): ThreadResponse {
  const messages = view.messages
    .filter(
      (message) =>
        options?.includeDrafts || !message.metadata.roles.includes("draft"),
    )
    .map((message) => conversationMessageToParsed(view, message));
  return {
    thread: {
      id: view.key.conversationId,
      snippet: messages.at(-1)?.snippet ?? "",
      messages,
    },
  };
}

export function conversationMessageToParsed(
  view: ConversationView,
  message: ConversationView["messages"][number],
): ParsedMessage {
  const date = new Date(message.metadata.receivedAtMs).toISOString();
  const html =
    message.content.status === "available" ? message.content.html : null;
  const text =
    message.content.status === "available" ? message.content.text : null;
  const descriptors =
    message.content.status === "available" ? message.content.attachments : [];
  const fileAttachments = descriptors
    .filter((attachment) => !attachment.inline)
    .map(descriptorToAttachment);
  const inline = descriptors
    .filter((attachment) => attachment.inline)
    .map(descriptorToInline);
  return {
    id: message.key.messageId,
    threadId: view.key.conversationId,
    date,
    internalDate: String(message.metadata.receivedAtMs),
    historyId: "",
    externalUrl: message.metadata.externalUrl ?? undefined,
    inline,
    snippet: message.metadata.preview,
    subject: message.metadata.subject,
    labelIds: messageLabelIds(message.metadata),
    parentFolderId: message.metadata.folderId ?? undefined,
    textHtml: html ?? undefined,
    textPlain: text ?? undefined,
    attachments: fileAttachments.length ? fileAttachments : undefined,
    isMeetingInvitation:
      message.content.status === "available"
        ? message.content.isMeetingInvitation || undefined
        : undefined,
    headers: {
      from: message.metadata.from,
      to: message.metadata.to.join(", "),
      cc: message.metadata.cc.join(", ") || undefined,
      date,
      subject: message.metadata.subject,
    },
  };
}

export const CONVERSATION_PAGE_SIZE = 50;

export function requestMissingMessageContent(
  client: Pick<MailClient, "ensureMessageContent">,
  view: ConversationView,
  requested?: Set<string>,
) {
  for (const message of view.messages) {
    if (message.content.status === "available") continue;
    if (requested?.has(message.key.messageId)) continue;
    requested?.add(message.key.messageId);
    client.ensureMessageContent(message.key).catch(() => undefined);
  }
}

export function missingConversationBodyIds(view: ConversationView) {
  return new Set(
    view.messages
      .filter((message) => message.content.status !== "available")
      .map((message) => message.key.messageId),
  );
}

function descriptorToAttachment(
  attachment: MessageAttachmentDescriptor,
): Attachment {
  return {
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    headers: descriptorHeaders(attachment),
  };
}

function descriptorToInline(
  attachment: MessageAttachmentDescriptor,
): ParsedMessage["inline"][number] {
  return {
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    headers: {
      "content-description": "",
      "content-id": "",
      "content-transfer-encoding": "base64",
      "content-type": attachment.mimeType,
    },
  };
}

function descriptorHeaders(attachment: MessageAttachmentDescriptor) {
  return {
    "content-description": "",
    "content-disposition": attachment.inline
      ? `inline; filename="${attachment.filename}"`
      : `attachment; filename="${attachment.filename}"`,
    "content-id": "",
    "content-transfer-encoding": "base64",
    "content-type": attachment.mimeType,
  };
}
