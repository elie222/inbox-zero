import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { ParsedMessage, EmailForLLM } from "@/utils/types";

const MAX_THREAD_STATUS_MESSAGES = 8;
const THREAD_STATUS_HEAD_MESSAGES = 1;
const THREAD_STATUS_OLDER_MESSAGE_MAX_LENGTH = 300;
const THREAD_STATUS_LATEST_MESSAGE_MAX_LENGTH = 2000;

export function buildThreadStatusMessagesForLLM(
  sortedMessages: ParsedMessage[],
): {
  threadMessages: EmailForLLM[];
  omittedMessageCount: number;
} {
  const selectedMessages = selectThreadStatusMessages(sortedMessages);

  return {
    threadMessages: selectedMessages.map((message, index) =>
      getEmailForLLM(message, {
        maxLength:
          index === selectedMessages.length - 1
            ? THREAD_STATUS_LATEST_MESSAGE_MAX_LENGTH
            : THREAD_STATUS_OLDER_MESSAGE_MAX_LENGTH,
        extractReply: true,
        removeForwarded: false,
      }),
    ),
    omittedMessageCount: Math.max(
      0,
      sortedMessages.length - selectedMessages.length,
    ),
  };
}

function selectThreadStatusMessages(sortedMessages: ParsedMessage[]) {
  if (sortedMessages.length <= MAX_THREAD_STATUS_MESSAGES)
    return sortedMessages;

  const tailCount = MAX_THREAD_STATUS_MESSAGES - THREAD_STATUS_HEAD_MESSAGES;
  const tailStartIndex = Math.max(
    THREAD_STATUS_HEAD_MESSAGES,
    sortedMessages.length - tailCount,
  );

  // Keep the opening email plus the recent window. Middle messages add a lot
  // of tokens but usually contribute less to turn-taking state.
  return [
    ...sortedMessages.slice(0, THREAD_STATUS_HEAD_MESSAGES),
    ...sortedMessages.slice(tailStartIndex),
  ];
}
