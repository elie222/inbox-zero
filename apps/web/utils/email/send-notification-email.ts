import { env } from "@/env";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";

export async function sendNotificationEmail({
  emailAccountId,
  userEmail,
  provider,
  subject,
  sendViaTransactionalEmail,
  renderHtml,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  provider: string;
  subject: string;
  sendViaTransactionalEmail: () => Promise<unknown>;
  renderHtml: () => Promise<string>;
  logger: Logger;
}): Promise<void> {
  if (env.TRANSACTIONAL_EMAIL_PROVIDER === "ses" || env.RESEND_API_KEY) {
    try {
      await sendViaTransactionalEmail();
      logger.info("Sent notification email via transactional provider");
      return;
    } catch (error) {
      logger.error(
        "Failed to send notification email via transactional provider, falling back to self-send",
        { error },
      );
    }
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  await emailProvider.sendEmailWithHtml({
    to: userEmail,
    subject,
    messageHtml: await renderHtml(),
  });

  logger.info("Sent notification email via the user's own mailbox");
}
