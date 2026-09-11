import { internalDateToDate } from "@/utils/date";
import { extractEmailAddresses, isSameEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { stringifyEmail } from "@/utils/stringify-email";

const MAX_SEARCHED_SENDER_THREADS = 8;
const MAX_SENDER_REPLY_EXAMPLES = 3;
const REPLY_EXAMPLE_BODY_MAX_LENGTH = 600;

export async function collectSenderReplyExamples({
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
}): Promise<{ content: string; count: number } | null> {
  if (!senderEmail) return null;
  if (isSameEmailAddress(senderEmail, emailAccount.email)) return null;

  const normalizedSenderEmail = senderEmail.trim().toLowerCase();

  try {
    const threads = await emailProvider.getThreadsWithParticipant({
      participantEmail: normalizedSenderEmail,
      maxThreads: MAX_SEARCHED_SENDER_THREADS,
    });

    const sentReplies = threads
      .flatMap((thread) => thread.messages)
      .filter((message) => {
        if (currentMessageIds.has(message.id)) return false;
        if (!emailProvider.isSentMessage(message)) return false;

        const recipients = [
          message.headers.to,
          message.headers.cc,
          message.headers.bcc,
        ]
          .filter((header): header is string => Boolean(header))
          .flatMap(extractEmailAddresses);

        return recipients.some((recipient) =>
          isSameEmailAddress(recipient, normalizedSenderEmail),
        );
      })
      .sort(
        (left, right) =>
          internalDateToDate(right.internalDate).getTime() -
          internalDateToDate(left.internalDate).getTime(),
      )
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
  } catch (error) {
    logger.warn("Failed to collect same-sender reply examples", {
      error,
      senderEmail: normalizedSenderEmail,
    });
    return null;
  }
}
