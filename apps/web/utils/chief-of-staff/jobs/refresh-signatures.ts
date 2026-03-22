import prisma from "@/utils/prisma";
import { getSignatureForAccount } from "@/utils/chief-of-staff/signatures/fetcher";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("chief-of-staff/jobs/refresh-signatures");

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export async function refreshSignatures(): Promise<number> {
  const cutoff = new Date(Date.now() - TWENTY_FOUR_HOURS_MS);

  const staleConfigs = await prisma.chiefOfStaffConfig.findMany({
    where: {
      enabled: true,
      OR: [
        { signatureLastFetched: null },
        { signatureLastFetched: { lt: cutoff } },
      ],
    },
    include: {
      emailAccount: {
        include: {
          account: {
            select: {
              access_token: true,
              refresh_token: true,
              expires_at: true,
            },
          },
        },
      },
    },
  });

  let refreshed = 0;

  for (const config of staleConfigs) {
    const { emailAccount } = config;
    const log = logger.with({ emailAccountId: emailAccount.id });

    if (
      !emailAccount.account?.access_token ||
      !emailAccount.account?.refresh_token
    ) {
      log.warn("Missing OAuth tokens, skipping signature refresh");
      continue;
    }

    try {
      const gmail = await getGmailClientWithRefresh({
        accessToken: emailAccount.account.access_token,
        refreshToken: emailAccount.account.refresh_token,
        expiresAt: emailAccount.account.expires_at
          ? emailAccount.account.expires_at.getTime()
          : null,
        emailAccountId: emailAccount.id,
        logger: log,
      });

      await getSignatureForAccount(
        emailAccount.id,
        emailAccount.email,
        gmail,
        prisma,
      );

      refreshed++;
    } catch (error) {
      log.error("Failed to refresh signature", { error });
    }
  }

  return refreshed;
}
