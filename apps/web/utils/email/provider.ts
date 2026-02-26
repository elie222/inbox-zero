import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/account";
import { GmailProvider } from "@/utils/email/google";
import { OutlookProvider } from "@/utils/email/microsoft";
import type { EmailProvider } from "@/utils/email/types";
import { assertProviderNotRateLimited } from "@/utils/email/rate-limit";
import { toRateLimitProvider } from "@/utils/email/rate-limit-mode-error";
import type { Logger } from "@/utils/logger";

export async function createEmailProvider({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}): Promise<EmailProvider> {
  const rateLimitProvider = toRateLimitProvider(provider);
  if (!rateLimitProvider) throw new Error(`Unsupported provider: ${provider}`);

  await assertProviderNotRateLimited({
    emailAccountId,
    provider: rateLimitProvider,
    logger,
    source: "create-email-provider",
  });

  if (rateLimitProvider === "google") {
    const client = await getGmailClientForEmail({ emailAccountId, logger });
    return new GmailProvider(client, logger, emailAccountId);
  }

  const client = await getOutlookClientForEmail({ emailAccountId, logger });
  return new OutlookProvider(client, logger);
}
