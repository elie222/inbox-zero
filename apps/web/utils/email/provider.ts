import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/account";
import { isLocalAuthBypassEnabled } from "@/utils/auth/local-bypass-config";
import { isLocalBypassEmailAccount } from "@/utils/auth/local-bypass-email-account";
import { GmailProvider } from "@/utils/email/google";
import { createLocalBypassEmailProvider } from "@/utils/email/local-bypass-provider";
import { OutlookProvider } from "@/utils/email/microsoft";
import type { EmailProvider } from "@/utils/email/types";
import { assertProviderNotRateLimited } from "@/utils/email/rate-limit";
import { toRateLimitProvider } from "@/utils/email/rate-limit-mode-error";
import type { Logger } from "@/utils/logger";
import { getRecordingSession } from "@/utils/replay/context";
import { createRecordingEmailProvider } from "@/utils/replay/recording-email-provider";

export async function createEmailProvider({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  logger: Logger;
}): Promise<EmailProvider> {
  if (isLocalAuthBypassEnabled()) {
    const localBypassProvider = await getLocalBypassProvider({
      emailAccountId,
      logger,
    });
    if (localBypassProvider) return localBypassProvider;
  }

  const rateLimitProvider = toRateLimitProvider(provider);
  if (!rateLimitProvider) throw new Error(`Unsupported provider: ${provider}`);

  await assertProviderNotRateLimited({
    emailAccountId,
    provider: rateLimitProvider,
    logger,
    source: "create-email-provider",
  });

  let emailProvider: EmailProvider;

  if (rateLimitProvider === "google") {
    const client = await getGmailClientForEmail({ emailAccountId, logger });
    emailProvider = new GmailProvider(client, logger, emailAccountId);
  } else {
    const client = await getOutlookClientForEmail({ emailAccountId, logger });
    emailProvider = new OutlookProvider(client, logger);
  }

  const session = getRecordingSession();
  if (session) {
    return createRecordingEmailProvider(emailProvider, session);
  }

  return emailProvider;
}

async function getLocalBypassProvider({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<EmailProvider | null> {
  if (!(await isLocalBypassEmailAccount(emailAccountId))) return null;

  return createLocalBypassEmailProvider(logger);
}
