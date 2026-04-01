import type { ModelMessage } from "ai";
import * as stringSimilarity from "string-similarity";

const MEMORY_EVIDENCE_SIMILARITY_THRESHOLD = 0.45;
const untrustedRetrievalToolNames = new Set([
  "searchInbox",
  "readEmail",
  "readAttachment",
]);

export type AssistantMemoryRuntimeContext = {
  conversationMessages: ModelMessage[];
  hasUntrustedRetrieval: boolean;
};

export function createAssistantMemoryRuntimeContext(
  conversationMessages: ModelMessage[],
): AssistantMemoryRuntimeContext {
  return {
    conversationMessages,
    hasUntrustedRetrieval: false,
  };
}

export function getAssistantMemoryRuntimeContext(
  experimentalContext: unknown,
  fallbackMessages?: ModelMessage[],
): AssistantMemoryRuntimeContext {
  const fallback = createAssistantMemoryRuntimeContext(fallbackMessages ?? []);

  if (!experimentalContext || typeof experimentalContext !== "object") {
    return fallback;
  }

  const value = experimentalContext as Partial<AssistantMemoryRuntimeContext>;

  return {
    conversationMessages: Array.isArray(value.conversationMessages)
      ? value.conversationMessages
      : fallback.conversationMessages,
    hasUntrustedRetrieval: value.hasUntrustedRetrieval === true,
  };
}

export function updateAssistantMemoryRuntimeContext({
  experimentalContext,
  fallbackMessages,
  steps,
}: {
  experimentalContext: unknown;
  fallbackMessages?: ModelMessage[];
  steps: Array<{ toolCalls?: Array<{ toolName?: string }> }>;
}): AssistantMemoryRuntimeContext {
  const context = getAssistantMemoryRuntimeContext(
    experimentalContext,
    fallbackMessages,
  );

  if (context.hasUntrustedRetrieval) return context;

  const hasUntrustedRetrieval = steps.some((step) =>
    (step.toolCalls ?? []).some((toolCall) =>
      untrustedRetrievalToolNames.has(toolCall.toolName ?? ""),
    ),
  );

  if (!hasUntrustedRetrieval) return context;

  return {
    ...context,
    hasUntrustedRetrieval: true,
  };
}

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
      similarityScore: 0,
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
      similarityScore: 0,
    };
  }

  const similarityScore = stringSimilarity.compareTwoStrings(
    normalizeMemoryText(content),
    normalizedEvidence,
  );

  if (similarityScore < MEMORY_EVIDENCE_SIMILARITY_THRESHOLD) {
    return {
      pass: false,
      reason:
        "The memory must stay close to the user's own wording instead of being inferred from retrieved content.",
      similarityScore,
    };
  }

  return {
    pass: true,
    reason: null,
    similarityScore,
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

function normalizeMemoryText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
