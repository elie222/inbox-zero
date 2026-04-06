import prisma from "@/utils/prisma";
import { encryptToken } from "@/utils/encryption";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { clearSpecificErrorMessages, ErrorType } from "@/utils/error-messages";

const logger = createScopedLogger("auth");

export async function saveTokens({
  tokens,
  accountRefreshToken,
  providerAccountId,
  emailAccountId,
  provider,
}: {
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
  };
  accountRefreshToken: string | null;
  provider: string;
} & (
  | {
      providerAccountId: string;
      emailAccountId?: never;
    }
  | {
      emailAccountId: string;
      providerAccountId?: never;
    }
)) {
  const refreshToken = tokens.refresh_token ?? accountRefreshToken;

  if (!refreshToken) {
    logger.error("Attempted to save null refresh token", { providerAccountId });
    captureException("Cannot save null refresh token", {
      extra: { providerAccountId },
    });
    return;
  }

  const data = {
    access_token: tokens.access_token,
    expires_at: tokens.expires_at ? new Date(tokens.expires_at * 1000) : null,
    refresh_token: refreshToken,
    disconnectedAt: null,
  };

  if (emailAccountId) {
    if (data.access_token)
      data.access_token = encryptToken(data.access_token) || undefined;
    if (data.refresh_token)
      data.refresh_token = encryptToken(data.refresh_token) || "";

    const emailAccount = await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { account: { update: data } },
      select: { userId: true },
    });

    await clearSpecificErrorMessages({
      userId: emailAccount.userId,
      errorTypes: [ErrorType.ACCOUNT_DISCONNECTED],
      logger,
    });
  } else {
    if (!providerAccountId) {
      logger.error("No providerAccountId found in database", {
        emailAccountId,
      });
      captureException("No providerAccountId found in database", {
        extra: { emailAccountId },
      });
      return;
    }

    const account = await prisma.account.update({
      where: {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      },
      data,
    });

    await clearSpecificErrorMessages({
      userId: account.userId,
      errorTypes: [ErrorType.ACCOUNT_DISCONNECTED],
      logger,
    });

    return account;
  }
}
