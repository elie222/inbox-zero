import type { ModelMessage } from "ai";

export function validateUserMemoryEvidence({
  content,
  userEvidence,
  conversationMessages,
}: {
  content: string;
  userEvidence: string;
  conversationMessages: ModelMessage[];
}) {
  const normalizedEvidence = normalizeMemoryText(userEvidence);
  if (!normalizedEvidence) {
    return {
      pass: false,
      reason: "Memory save requires a direct quote from a user chat message.",
    };
  }

  const normalizedUserMessages = getUserConversationTexts(conversationMessages);
  const evidenceFoundInUserMessage = normalizedUserMessages.some((message) =>
    message.includes(normalizedEvidence),
  );

  if (!evidenceFoundInUserMessage) {
    return {
      pass: false,
      reason:
        "Memory save requires an exact supporting quote from a user-authored chat message.",
    };
  }

  const normalizedContent = normalizeMemoryText(content);
  if (!normalizedContent) {
    return {
      pass: false,
      reason:
        "Memory save content must use the user's exact wording from chat.",
    };
  }

  const contentFoundInUserMessage = normalizedUserMessages.some((message) =>
    message.includes(normalizedContent),
  );

  if (!contentFoundInUserMessage) {
    return {
      pass: false,
      reason:
        "Memory save content must copy the user's exact wording from chat instead of rephrasing it in assistant voice.",
    };
  }

  return {
    pass: true,
    reason: null,
  };
}

export function getUserConversationMessages(messages: ModelMessage[]) {
  return messages.filter((message) => message.role === "user");
}

function getUserConversationTexts(messages: ModelMessage[]) {
  return getUserConversationMessages(messages)
    .map((message) => normalizeMemoryText(extractMessageText(message.content)))
    .filter(Boolean);
}

function extractMessageText(content: ModelMessage["content"]) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .flatMap((part) =>
      "text" in part && typeof part.text === "string" ? [part.text] : [],
    )
    .join("\n");
}

export function normalizeMemoryText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
