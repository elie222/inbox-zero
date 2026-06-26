import { cleanupInvalidTokens } from "@/utils/auth/cleanup-invalid-tokens";
import {
  getErrorMessage,
  isGmailInsufficientPermissionsError,
  isInvalidGrantError,
  isOutlookAccessDeniedError,
} from "@/utils/error";
import type { Logger } from "@/utils/logger";
import {
  claimProviderIssueCleanupInRedis,
  releaseProviderIssueCleanupClaimInRedis,
} from "@/utils/redis/provider-issue-cleanup";

type ProviderIssueReason =
  | "invalid_grant"
  | "insufficient_permissions"
  | "policy_enforced"
  | "mail_service_not_enabled";

type ProviderIssue = {
  reason: ProviderIssueReason;
};

export async function recordEmailAccountProviderIssue({
  emailAccountId,
  provider,
  error,
  logger,
  operation,
}: {
  emailAccountId: string;
  provider: "google" | "microsoft";
  error: unknown;
  logger: Logger;
  operation: string;
}) {
  const issue = classifyEmailAccountProviderIssue({ error, provider });
  if (!issue) return;

  logger.warn("Recording email account provider issue", {
    emailAccountId,
    provider,
    operation,
    reason: issue.reason,
  });

  const shouldRecord = await claimProviderIssueCleanup({
    emailAccountId,
    provider,
    operation,
    reason: issue.reason,
    logger,
  });
  if (!shouldRecord) return;

  try {
    await cleanupInvalidTokens({
      emailAccountId,
      reason: issue.reason,
      logger,
    });
  } catch (error) {
    logger.warn("Failed to clean up provider account issue", {
      error,
      emailAccountId,
      provider,
      operation,
      reason: issue.reason,
    });
    await releaseProviderIssueCleanupClaim({
      emailAccountId,
      reason: issue.reason,
      logger,
    });
  }
}

export function classifyEmailAccountProviderIssue({
  error,
  provider,
}: {
  error: unknown;
  provider: "google" | "microsoft";
}): ProviderIssue | null {
  const message = getErrorMessage(error);

  if (
    provider === "google" &&
    (isGmailInsufficientPermissionsError(error) ||
      message?.includes("Request had insufficient authentication scopes"))
  ) {
    return { reason: "insufficient_permissions" };
  }

  if (provider === "microsoft" && isOutlookAccessDeniedError(error)) {
    return { reason: "insufficient_permissions" };
  }

  if (
    provider === "google" &&
    (message?.includes("policy_enforced") ||
      message?.includes("Advanced Protection prevented your Google Account"))
  ) {
    return { reason: "policy_enforced" };
  }

  if (provider === "google" && message?.includes("Mail service not enabled")) {
    return { reason: "mail_service_not_enabled" };
  }

  if (isInvalidGrantError(error) || message?.includes("No refresh token")) {
    return { reason: "invalid_grant" };
  }

  return null;
}

async function claimProviderIssueCleanup({
  emailAccountId,
  provider,
  operation,
  reason,
  logger,
}: {
  emailAccountId: string;
  provider: "google" | "microsoft";
  operation: string;
  reason: ProviderIssueReason;
  logger: Logger;
}) {
  try {
    const claimed = await claimProviderIssueCleanupInRedis({
      emailAccountId,
      reason,
    });
    if (claimed) return true;

    logger.info("Skipping duplicate provider issue cleanup", {
      emailAccountId,
      provider,
      operation,
      reason,
    });
    return false;
  } catch (error) {
    logger.warn("Failed to claim provider issue cleanup", {
      error,
      emailAccountId,
      provider,
      operation,
      reason,
    });
    return true;
  }
}

async function releaseProviderIssueCleanupClaim({
  emailAccountId,
  reason,
  logger,
}: {
  emailAccountId: string;
  reason: ProviderIssueReason;
  logger: Logger;
}) {
  try {
    await releaseProviderIssueCleanupClaimInRedis({ emailAccountId, reason });
  } catch (error) {
    logger.warn("Failed to release provider issue cleanup claim", {
      error,
      emailAccountId,
      reason,
    });
  }
}
