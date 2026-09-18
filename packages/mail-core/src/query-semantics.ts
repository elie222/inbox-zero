import type { MessageMetadata } from "./messages";
import type { MailPredicate } from "./queries";

export type EffectiveMessage = MessageMetadata & {
  accountId: string;
  messageId: string;
  conversationId: string;
  pendingOperationIds: string[];
  bodyText?: string | null;
};

export function messageMatchesPredicate(
  message: EffectiveMessage,
  predicate: MailPredicate,
): boolean {
  switch (predicate.kind) {
    case "all":
      return predicate.predicates.every((child) =>
        messageMatchesPredicate(message, child),
      );
    case "any":
      return predicate.predicates.some((child) =>
        messageMatchesPredicate(message, child),
      );
    case "not":
      return !messageMatchesPredicate(message, predicate.predicate);
    case "role":
      return message.roles.includes(predicate.role);
    case "read":
      return message.read === predicate.value;
    case "starred":
      return message.starred === predicate.value;
    case "membership":
      if (predicate.membership === "folder") {
        return message.folderId === predicate.id;
      }
      if (predicate.membership === "label") {
        return message.labelIds.includes(predicate.id);
      }
      return message.categoryIds.includes(predicate.id);
    case "address":
      return addressMatches(
        message,
        predicate.field,
        predicate.value,
        predicate.match,
      );
    case "received":
      if (
        predicate.afterMs !== null &&
        message.receivedAtMs < predicate.afterMs
      ) {
        return false;
      }
      if (
        predicate.beforeMs !== null &&
        message.receivedAtMs >= predicate.beforeMs
      ) {
        return false;
      }
      return true;
    case "has_attachment":
      return message.hasAttachments === predicate.value;
    case "text":
      return textMatches(
        message,
        predicate.field,
        predicate.value,
        predicate.match,
      );
    default: {
      const exhaustive: never = predicate;
      return exhaustive;
    }
  }
}

export function conversationMatchesPredicate(
  messages: EffectiveMessage[],
  predicate: MailPredicate,
): boolean {
  return messages.some((message) =>
    messageMatchesPredicate(message, predicate),
  );
}

export function conversationIsUnread(
  messages: EffectiveMessage[],
  predicate: MailPredicate,
): boolean {
  return messages.some(
    (message) =>
      messageMatchesPredicate(message, predicate) && message.read === false,
  );
}

function addressMatches(
  message: EffectiveMessage,
  field: "from" | "to" | "cc",
  value: string,
  match: "address" | "domain",
): boolean {
  const candidates =
    field === "from"
      ? [message.from]
      : field === "to"
        ? message.to
        : message.cc;
  const needle = value.toLowerCase();
  return candidates.some((candidate) => {
    const email = extractEmail(candidate).toLowerCase();
    if (match === "address")
      return email === needle || candidate.toLowerCase().includes(needle);
    const domain = email.split("@")[1] ?? "";
    return domain === needle || domain.endsWith(`.${needle}`);
  });
}

function textMatches(
  message: EffectiveMessage,
  field: "any" | "subject" | "body",
  value: string,
  match: "term" | "phrase",
): boolean {
  const haystacks =
    field === "subject"
      ? [message.subject]
      : field === "body"
        ? [message.bodyText ?? message.preview]
        : [
            message.subject,
            message.preview,
            message.bodyText ?? "",
            message.from,
          ];
  const needle = value.toLowerCase();
  return haystacks.some((haystack) => {
    const text = haystack.toLowerCase();
    if (match === "phrase") return text.includes(needle);
    return needle.split(/\s+/).every((term) => text.includes(term));
  });
}

function extractEmail(value: string): string {
  const start = value.indexOf("<");
  const end = value.indexOf(">", start + 1);
  if (start >= 0 && end > start) {
    return value.slice(start + 1, end).trim();
  }
  return value.trim();
}
