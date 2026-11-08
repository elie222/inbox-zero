import { internalDateToDate } from "@/utils/date";
import { extractEmailAddresses, isSameEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { stringifyEmail } from "@/utils/stringify-email";
import type { ParsedMessage } from "@/utils/types";

const MAX_SEARCHED_SENDER_THREADS = 8;
const MAX_SENDER_REPLY_EXAMPLES = 3;
const REPLY_EXAMPLE_BODY_MAX_LENGTH = 600;

/**
 * Messages from the user's other threads with this sender, newest first.
 * Messages in the thread being drafted are left out.
 */
export async function getSenderHistoryMessages({
  emailAccount,
  emailProvider,
  senderEmail,
  currentMessageIds,
  logger,
}: {
  emailAccount: EmailAccountWithAI;
  emailProvider: EmailProvider;
  senderEmail: string;
  currentMessageIds: Set<string>;
  logger: Logger;
}): Promise<ParsedMessage[]> {
  if (!senderEmail) return [];
  if (isSameEmailAddress(senderEmail, emailAccount.email)) return [];

  try {
    const threads = await emailProvider.getThreadsWithParticipant({
      participantEmail: senderEmail.trim().toLowerCase(),
      maxThreads: MAX_SEARCHED_SENDER_THREADS,
    });

    return threads
      .flatMap((thread) => thread.messages)
      .filter((message) => !currentMessageIds.has(message.id))
      .sort(
        (left, right) =>
          internalDateToDate(right.internalDate).getTime() -
          internalDateToDate(left.internalDate).getTime(),
      );
  } catch (error) {
    logger.warn("Failed to load sender history", { error });
    logger.trace("Failed to load sender history", { senderEmail });
    return [];
  }
}

export function collectSenderReplyExamples({
  emailProvider,
  senderEmail,
  senderHistoryMessages,
}: {
  emailProvider: EmailProvider;
  senderEmail: string;
  senderHistoryMessages: ParsedMessage[];
}): { content: string; count: number } | null {
  const sentReplies = senderHistoryMessages
    .filter((message) => {
      if (!emailProvider.isSentMessage(message)) return false;

      const recipients = [
        message.headers.to,
        message.headers.cc,
        message.headers.bcc,
      ]
        .filter((header): header is string => Boolean(header))
        .flatMap(extractEmailAddresses);

      return recipients.some((recipient) =>
        isSameEmailAddress(recipient, senderEmail),
      );
    })
    .slice(0, MAX_SENDER_REPLY_EXAMPLES);

  if (!sentReplies.length) return null;

  return {
    count: sentReplies.length,
    content: sentReplies
      .map((message) => {
        const email = getEmailForLLM(message, {
          extractReply: true,
          removeForwarded: true,
        });

        return `<reply_example>\n${stringifyEmail(email, REPLY_EXAMPLE_BODY_MAX_LENGTH)}\n</reply_example>`;
      })
      .join("\n\n"),
  };
}
