import {
  getGmailClientForEmail,
  getOutlookClientForEmail,
} from "@/utils/account";
import {
  isLocalAuthBypassEnabled,
  isLocalBypassProviderAccountId,
} from "@/utils/auth/local-bypass-config";
import { GmailProvider } from "@/utils/email/google";
import { createLocalBypassEmailProvider } from "@/utils/email/local-bypass-provider";
import { OutlookProvider } from "@/utils/email/microsoft";
import type { EmailProvider } from "@/utils/email/types";
import { assertProviderNotRateLimited } from "@/utils/email/rate-limit";
import { toRateLimitProvider } from "@/utils/email/rate-limit-mode-error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

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

  if (rateLimitProvider === "google") {
    const client = await getGmailClientForEmail({ emailAccountId, logger });
    return new GmailProvider(client, logger, emailAccountId);
  }

  const client = await getOutlookClientForEmail({ emailAccountId, logger });
  return new OutlookProvider(client, logger);
}

async function getLocalBypassProvider({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<EmailProvider | null> {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          providerAccountId: true,
        },
      },
    },
  });

  if (
    !isLocalBypassProviderAccountId(emailAccount?.account.providerAccountId)
  ) {
    return null;
  }

  return createLocalBypassEmailProvider(logger);
}
