import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { getFormattedSenderAddress } from "@/utils/email/get-formatted-sender-address";

/**
 * Forwards an existing message, re-fetching its attachments and building the
 * forwarded subject and quoted body from the original.
 *
 * Resolves the account's own from address so the forward goes out with the
 * user's display name and send-as alias rather than the raw account address.
 */
export async function forwardMessage({
  emailProvider,
  emailAccountId,
  message,
  to,
  cc,
  bcc,
  content,
}: {
  emailProvider: EmailProvider;
  emailAccountId: string;
  message: ParsedMessage;
  to: string;
  cc?: string | null;
  bcc?: string | null;
  content?: string | null;
}) {
  const from = await getFormattedSenderAddress({ emailAccountId });

  await emailProvider.forwardEmail(message, {
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    content: content || undefined,
    from: from || undefined,
  });
}
