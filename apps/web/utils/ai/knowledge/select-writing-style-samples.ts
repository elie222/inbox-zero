import type { ParsedMessage } from "@/utils/types";
import { emailToContent, hasQuotedReplyContent } from "@/utils/mail";

const MIN_REPLY_SAMPLES_FOR_STYLE = 5;

export function selectWritingStyleSampleMessages(
  sentMessages: ParsedMessage[],
) {
  const replyMessages = sentMessages.filter((message) =>
    hasQuotedReplyContent(emailToContent(message, { maxLength: 0 })),
  );

  return replyMessages.length >= MIN_REPLY_SAMPLES_FOR_STYLE
    ? replyMessages
    : sentMessages;
}
