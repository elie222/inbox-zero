import type { ConversationView } from "@inboxzero/mail-core/ports/mail-store";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import type { ParsedMessage } from "@/utils/types";
import { messageLabelIds } from "@/utils/mail-engine/list-thread";

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
  return {
    id: message.key.messageId,
    threadId: view.key.conversationId,
    date,
    internalDate: String(message.metadata.receivedAtMs),
    historyId: "",
    inline: [],
    snippet: message.metadata.preview,
    subject: message.metadata.subject,
    labelIds: messageLabelIds(message.metadata),
    parentFolderId: message.metadata.folderId ?? undefined,
    textHtml: html ?? undefined,
    textPlain: text ?? undefined,
    headers: {
      from: message.metadata.from,
      to: message.metadata.to.join(", "),
      cc: message.metadata.cc.join(", ") || undefined,
      date,
      subject: message.metadata.subject,
    },
  };
}

export function missingConversationBodyIds(view: ConversationView) {
  return new Set(
    view.messages
      .filter((message) => message.content.status !== "available")
      .map((message) => message.key.messageId),
  );
}
