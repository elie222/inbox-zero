import { cleanupInvalidTokens } from "@/utils/auth/cleanup-invalid-tokens";
import {
  getErrorMessage,
  isGmailInsufficientPermissionsError,
  isInvalidGrantError,
  isOutlookItemNotFoundError,
  isOutlookThrottlingError,
} from "@/utils/error";
import type { Logger } from "@/utils/logger";

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

  await cleanupInvalidTokens({
    emailAccountId,
    reason: issue.reason,
    logger,
  });
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

  if (
    isInvalidGrantError(error) ||
    message?.includes("No refresh token") ||
    message?.includes("Invalid access token")
  ) {
    return { reason: "invalid_grant" };
  }

  if (isOutlookThrottlingError(error) || isOutlookItemNotFoundError(error)) {
    return null;
  }

  return null;
}
