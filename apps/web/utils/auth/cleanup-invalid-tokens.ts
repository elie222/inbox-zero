import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { sendReconnectionEmail } from "@inboxzero/resend";
import { env } from "@/env";
import { addUserErrorMessage, ErrorType } from "@/utils/error-messages";
import { createUnsubscribeToken } from "@/utils/unsubscribe";

/**
 * Cleans up invalid tokens when authentication fails permanently.
 * Used for:
 * - invalid_grant: User revoked access or tokens expired
 * - insufficientPermissions: User hasn't granted all required scopes
 */
export async function cleanupInvalidTokens({
  emailAccountId,
  reason,
  logger,
}: {
  emailAccountId: string;
  reason: "invalid_grant" | "insufficient_permissions";
  logger: Logger;
}) {
  logger.info("Cleaning up invalid tokens", { reason });

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      email: true,
      accountId: true,
      userId: true,
      watchEmailsExpirationDate: true,
      account: {
        select: {
          disconnectedAt: true,
        },
      },
    },
  });

  if (!emailAccount) {
    logger.warn("Email account not found");
    return;
  }

  if (emailAccount.account?.disconnectedAt) {
    logger.info("Account already marked as disconnected");
    return;
  }

  const updated = await prisma.account.updateMany({
    where: { id: emailAccount.accountId, disconnectedAt: null },
    data: {
      access_token: null,
      refresh_token: null,
      expires_at: null,
      disconnectedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    logger.info(
      "Account already marked as disconnected (via concurrent update)",
    );
    return;
  }

  if (reason === "invalid_grant") {
    const isWatched =
      !!emailAccount.watchEmailsExpirationDate &&
      emailAccount.watchEmailsExpirationDate > new Date();

    if (isWatched) {
      try {
        const unsubscribeToken = await createUnsubscribeToken({
          emailAccountId: emailAccount.id,
        });

        await sendReconnectionEmail({
          from: env.RESEND_FROM_EMAIL,
          to: emailAccount.email,
          emailProps: {
            baseUrl: env.NEXT_PUBLIC_BASE_URL,
            email: emailAccount.email,
            unsubscribeToken,
          },
        });
        logger.info("Reconnection email sent", { email: emailAccount.email });
      } catch (error) {
        logger.error("Failed to send reconnection email", {
          email: emailAccount.email,
          error,
        });
      }
    } else {
      logger.info(
        "Skipping reconnection email - account not currently watched",
      );
    }

    await addUserErrorMessage(
      emailAccount.userId,
      ErrorType.ACCOUNT_DISCONNECTED,
      `The connection for ${emailAccount.email} was disconnected. Please reconnect your account to resume automation.`,
      logger,
    );
  }

  logger.info("Tokens cleared - user must re-authenticate", { reason });
}
