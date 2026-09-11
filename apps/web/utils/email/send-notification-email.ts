import { env } from "@/env";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";

export async function sendNotificationEmail({
  emailAccountId,
  userEmail,
  provider,
  subject,
  sendViaResend,
  renderHtml,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  provider: string;
  subject: string;
  sendViaResend: () => Promise<unknown>;
  renderHtml: () => Promise<string>;
  logger: Logger;
}): Promise<void> {
  if (env.RESEND_API_KEY) {
    try {
      await sendViaResend();
      logger.info("Sent notification email via Resend");
      return;
    } catch (error) {
      logger.error(
        "Failed to send notification email via Resend, falling back to self-send",
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
