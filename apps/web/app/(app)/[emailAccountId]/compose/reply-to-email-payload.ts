import type { SendEmailBody } from "@/utils/types/mail";
import type { ReplyingToEmail } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailForm";

/**
 * The thread metadata a compose sends alongside the message.
 *
 * The thread id alone is enough for the provider to keep the message in its
 * conversation, so a forward, which has no message to reply to, still belongs
 * to the thread it was forwarded from.
 */
export function getReplyToEmailPayload(
  replyingToEmail:
    | Pick<
        ReplyingToEmail,
        | "threadId"
        | "headerMessageId"
        | "references"
        | "messageId"
        | "forwardedMessageId"
      >
    | undefined,
): SendEmailBody["replyToEmail"] | undefined {
  const threadId = replyingToEmail?.threadId?.trim();
  if (!threadId) return;

  const headerMessageId = replyingToEmail?.headerMessageId?.trim();
  const references = replyingToEmail?.references;
  const messageId = replyingToEmail?.messageId;
  const forwardedMessageId = replyingToEmail?.forwardedMessageId;

  return {
    threadId,
    ...(headerMessageId ? { headerMessageId } : {}),
    ...(references ? { references } : {}),
    ...(messageId ? { messageId } : {}),
    ...(forwardedMessageId ? { forwardedMessageId } : {}),
  };
}
