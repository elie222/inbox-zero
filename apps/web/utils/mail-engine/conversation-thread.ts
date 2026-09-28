import type { MessageAttachmentDescriptor } from "@inboxzero/mail-core/messages";
import type { MailClient } from "@inboxzero/mail-core/engine";
import type { OperationStatus } from "@inboxzero/mail-core/operations";
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

export type OutgoingThreadMessage = {
  operationId: string;
  status: OperationStatus;
  message: ParsedMessage;
};

/**
 * Sends queued on this device, shaped like the messages they will become so the
 * reader shows them in the conversation until the provider confirms them.
 */
export function conversationOutgoingMessages(
  view: ConversationView,
): OutgoingThreadMessage[] {
  return (view.outgoing ?? []).map((outgoing) => ({
    operationId: outgoing.operationId,
    status: outgoing.status,
    message: conversationMessageToParsed(view, {
      key: {
        accountId: view.key.accountId,
        messageId: `outgoing:${outgoing.operationId}`,
      },
      metadata: outgoing.metadata,
      content: {
        status: "available",
        html: outgoing.html,
        text: null,
        attachments: [],
        isMeetingInvitation: false,
      },
      pendingOperationIds: [outgoing.operationId],
    }),
  }));
}

/** Which send each confirmed message came from, keyed by message id. */
export function conversationSendOperationIds(view: ConversationView) {
  return new Map(
    view.messages.flatMap((message) =>
      message.sendOperationId
        ? [[message.key.messageId, message.sendOperationId] as const]
        : [],
    ),
  );
}

export const CONVERSATION_PAGE_SIZE = 50;

/**
 * `requested` spans one observation so each snapshot doesn't re-request. A
 * rejected or failed request is forgotten so the next snapshot retries it.
 */
export function requestMissingMessageContent(
  client: Pick<MailClient, "ensureMessageContent">,
  view: ConversationView,
  requested: Set<string>,
) {
  for (const message of view.messages) {
    const { messageId } = message.key;
    if (message.content.status === "available") continue;
    if (requested.has(messageId)) continue;
    requested.add(messageId);
    client
      .ensureMessageContent(message.key)
      .then((admission) => {
        if (admission.status === "rejected") requested.delete(messageId);
      })
      .catch(() => requested.delete(messageId));
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
