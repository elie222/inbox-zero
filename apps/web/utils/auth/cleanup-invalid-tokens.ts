import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { sendReconnectionEmail } from "@inboxzero/resend";
import { env } from "@/env";
import {
  addUserErrorMessage,
  addUserErrorMessageWithNotification,
  ErrorType,
} from "@/utils/error-messages";
import { createUnsubscribeToken } from "@/utils/unsubscribe";

/**
 * Cleans up invalid tokens when authentication fails permanently.
 * Used for:
 * - invalid_grant: User revoked access or tokens expired
 * - insufficientPermissions: User hasn't granted all required scopes
 * - policy_enforced: Provider policy blocks access until user changes settings
 * - mail_service_not_enabled: Provider mailbox is unavailable for this account
 */
export async function cleanupInvalidTokens({
  emailAccountId,
  reason,
  logger,
}: {
  emailAccountId: string;
  reason:
    | "invalid_grant"
    | "insufficient_permissions"
    | "policy_enforced"
    | "mail_service_not_enabled";
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
      user: {
        select: {
          email: true,
        },
      },
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

  const errorMessage = getAccountActionRequiredMessage(
    emailAccount.email,
    reason,
  );
  const sentReconnectionEmail =
    reason === "invalid_grant"
      ? await sendWatchedAccountReconnectionEmail({
          emailAccountId: emailAccount.id,
          email: emailAccount.email,
          recipientEmail: emailAccount.email,
          watchEmailsExpirationDate: emailAccount.watchEmailsExpirationDate,
          logger,
        })
      : false;

  if (sentReconnectionEmail) {
    await addUserErrorMessage(
      emailAccount.userId,
      ErrorType.ACCOUNT_DISCONNECTED,
      errorMessage,
      logger,
    );
  } else {
    await addUserErrorMessageWithNotification({
      userId: emailAccount.userId,
      userEmail: emailAccount.email,
      emailAccountId: emailAccount.id,
      errorType: ErrorType.ACCOUNT_DISCONNECTED,
      errorMessage,
      logger,
    });
  }

  logger.info("Tokens cleared - user must re-authenticate", { reason });
}

async function sendWatchedAccountReconnectionEmail({
  emailAccountId,
  email,
  recipientEmail,
  watchEmailsExpirationDate,
  logger,
}: {
  emailAccountId: string;
  email: string;
  recipientEmail: string;
  watchEmailsExpirationDate: Date | null;
  logger: Logger;
}) {
  const isWatched =
    !!watchEmailsExpirationDate && watchEmailsExpirationDate > new Date();

  if (!isWatched) {
    logger.info("Skipping reconnection email - account not currently watched");
    return false;
  }

  try {
    const unsubscribeToken = await createUnsubscribeToken({ emailAccountId });

    await sendReconnectionEmail({
      from: env.RESEND_FROM_EMAIL,
      to: recipientEmail,
      emailProps: {
        baseUrl: env.NEXT_PUBLIC_BASE_URL,
        email,
        unsubscribeToken,
      },
    });
    logger.info("Reconnection email sent", { email, recipientEmail });
    return true;
  } catch (error) {
    logger.error("Failed to send reconnection email", {
      email,
      error,
    });
    return false;
  }
}

function getAccountActionRequiredMessage(
  email: string,
  reason:
    | "invalid_grant"
    | "insufficient_permissions"
    | "policy_enforced"
    | "mail_service_not_enabled",
) {
  switch (reason) {
    case "insufficient_permissions":
      return `The connection for ${email} is missing required permissions. Please reconnect your account and approve the requested permissions to resume automation.`;
    case "policy_enforced":
      return `The connection for ${email} is blocked by your Google account security policy. Please review your Google security settings and reconnect your account to resume automation.`;
    case "mail_service_not_enabled":
      return `Gmail is not enabled for ${email}. Please enable Gmail for this account and reconnect it to resume automation.`;
    default:
      return `The connection for ${email} was disconnected. Please reconnect your account to resume automation.`;
  }
}
