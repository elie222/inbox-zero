import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/account";
import { GmailProvider } from "@/utils/email/google";
import { OutlookProvider } from "@/utils/email/microsoft";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { EmailProvider } from "@/utils/email/types";
import { assertProviderNotRateLimited } from "@/utils/email/rate-limit";
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
  if (isGoogleProvider(provider)) {
    await assertProviderNotRateLimited({
      emailAccountId,
      provider: "google",
      logger,
      source: "create-email-provider",
    });

    const client = await getGmailClientForEmail({ emailAccountId, logger });
    return new GmailProvider(client, logger, emailAccountId);
  } else if (isMicrosoftProvider(provider)) {
    const client = await getOutlookClientForEmail({ emailAccountId, logger });
    return new OutlookProvider(client, logger);
  }

  throw new Error(`Unsupported provider: ${provider}`);
}
