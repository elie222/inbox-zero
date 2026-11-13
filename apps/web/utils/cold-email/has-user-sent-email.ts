import { extractEmailAddresses } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import { isRuleGeneratedMessage } from "@/utils/ai/rule-generated-message";

export async function hasUserSentEmail({
  provider,
  emailAccountId,
  sender,
}: {
  provider: Pick<EmailProvider, "getThreadsWithQuery" | "isSentMessage">;
  emailAccountId: string;
  sender: string;
}): Promise<boolean> {
  let pageToken: string | undefined;

  // Recovery of stale patterns must stay bounded even for long automated conversations.
  for (let page = 0; page < 3; page++) {
    const result = await provider.getThreadsWithQuery({
      query: { type: "sent", toEmail: sender },
      maxResults: 10,
      pageToken,
    });

    for (const thread of result.threads) {
      for (const message of thread.messages) {
        const recipients = [
          message.headers.to,
          message.headers.cc ?? "",
          message.headers.bcc ?? "",
        ].flatMap(extractEmailAddresses);
        if (
          !provider.isSentMessage(message) ||
          !recipients.some(
            (address) => address.toLowerCase() === sender.toLowerCase(),
          )
        ) {
          continue;
        }

        if (
          !(await isRuleGeneratedMessage({
            emailAccountId,
            threadId: thread.id,
            messageId: message.id,
          }))
        ) {
          return true;
        }
      }
    }

    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }

  return false;
}
