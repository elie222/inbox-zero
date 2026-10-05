import type { ModelMessage } from "ai";

const wordSegmenter = new Intl.Segmenter(undefined, { granularity: "word" });

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

  if (!hasSpecificMemoryDetail(normalizedEvidence)) {
    return {
      pass: false,
      reason:
        "Memory save requires the user to restate the specific fact or preference in chat instead of referring to it indirectly.",
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

  if (!hasSpecificMemoryDetail(normalizedContent)) {
    return {
      pass: false,
      reason:
        "Memory save content must capture the specific fact or preference, not just a generic reference to it.",
    };
  }

  const contentAndEvidenceFoundInSameUserMessage = normalizedUserMessages.some(
    (message) =>
      message.includes(normalizedEvidence) &&
      message.includes(normalizedContent),
  );

  if (!contentAndEvidenceFoundInSameUserMessage) {
    return {
      pass: false,
      reason:
        "Memory save content must copy the user's exact wording from the same user chat message as the supporting quote instead of rephrasing it in assistant voice.",
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
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasSpecificMemoryDetail(value: string) {
  const tokens = Array.from(wordSegmenter.segment(value))
    .filter((segment) => segment.isWordLike)
    .map((segment) => segment.segment);
  const informativeTokens = tokens.filter(isInformativeToken);

  return tokens.length >= 4 && informativeTokens.length >= 3;
}

// Length is only a useful "not a filler word" signal for alphabetic scripts.
// Han characters carry a full word each, and words in other scripts are
// segmented into short units, so a shorter minimum applies there.
function isInformativeToken(token: string) {
  if (
    /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\p{N}]+$/u.test(token)
  ) {
    return token.length >= 4;
  }
  if (/\p{Script=Han}/u.test(token)) return true;

  return token.length >= 2;
}
