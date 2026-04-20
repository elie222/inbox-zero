import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { ParsedMessage, EmailForLLM } from "@/utils/types";

const THREAD_STATUS_FIRST_MESSAGE_MAX_LENGTH = 500;
const THREAD_STATUS_MIDDLE_MESSAGE_MAX_LENGTH = 120;
const THREAD_STATUS_RECENT_TAIL_MESSAGE_MAX_LENGTH = 500;
const THREAD_STATUS_LATEST_MESSAGE_MAX_LENGTH = 2000;
const THREAD_STATUS_RECENT_TAIL_MESSAGES = 8;

export function buildThreadStatusMessagesForLLM(
  sortedMessages: ParsedMessage[],
): EmailForLLM[] {
  return sortedMessages.map((message, index) =>
    getEmailForLLM(message, {
      maxLength: getMaxLengthForThreadStatusMessage({
        index,
        totalMessages: sortedMessages.length,
      }),
      extractReply: true,
      removeForwarded: false,
    }),
  );
}

function getMaxLengthForThreadStatusMessage({
  index,
  totalMessages,
}: {
  index: number;
  totalMessages: number;
}) {
  const latestMessageIndex = totalMessages - 1;
  if (index === latestMessageIndex)
    return THREAD_STATUS_LATEST_MESSAGE_MAX_LENGTH;
  if (index === 0) return THREAD_STATUS_FIRST_MESSAGE_MAX_LENGTH;

  const recentTailStartIndex = Math.max(
    1,
    latestMessageIndex - THREAD_STATUS_RECENT_TAIL_MESSAGES,
  );
  if (index >= recentTailStartIndex) {
    return THREAD_STATUS_RECENT_TAIL_MESSAGE_MAX_LENGTH;
  }

  return THREAD_STATUS_MIDDLE_MESSAGE_MAX_LENGTH;
}
