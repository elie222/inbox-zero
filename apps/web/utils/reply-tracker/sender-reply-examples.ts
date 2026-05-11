import { internalDateToDate } from "@/utils/date";
import { extractEmailAddresses, isSameEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { removeExcessiveWhitespace } from "@/utils/string";
import type { EmailForLLM } from "@/utils/types";

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

        const recipients = extractEmailAddresses(
          [
            message.headers.to,
            message.headers.cc ?? "",
            message.headers.bcc ?? "",
          ].join(","),
        );

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
            maxLength: REPLY_EXAMPLE_BODY_MAX_LENGTH + 1,
            extractReply: true,
            removeForwarded: true,
          });

          return formatReplyExample(email);
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

function formatReplyExample(email: EmailForLLM) {
  const body = formatReplyExampleBody(email.content);
  const bodyTag = body.truncated ? '<body truncated="true">' : "<body>";

  return `<reply_example>
<from>${email.from}</from>
${email.to ? `<to>${email.to}</to>` : ""}
${email.date ? `<date>${email.date.toISOString()}</date>` : ""}
<subject>${email.subject}</subject>
${bodyTag}${body.content}</body>
</reply_example>`;
}

function formatReplyExampleBody(content: string) {
  const cleanedContent = removeExcessiveWhitespace(content);
  if (cleanedContent.length <= REPLY_EXAMPLE_BODY_MAX_LENGTH) {
    return { content: cleanedContent, truncated: false };
  }

  return {
    content: `${cleanedContent
      .slice(0, REPLY_EXAMPLE_BODY_MAX_LENGTH)
      .trimEnd()}\n[truncated]`,
    truncated: true,
  };
}
