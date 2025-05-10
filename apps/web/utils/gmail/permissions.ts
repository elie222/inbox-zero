import { SCOPES } from "@/utils/gmail/scopes";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("Gmail Permissions");

// TODO: this can also error on network error
async function checkGmailPermissions({
  accessToken,
  emailAccountId,
}: {
  accessToken: string;
  emailAccountId: string;
}): Promise<{
  hasAllPermissions: boolean;
  missingScopes: string[];
  error?: string;
}> {
  if (!accessToken) {
    logger.error("No access token available", { emailAccountId });
    return {
      hasAllPermissions: false,
      missingScopes: SCOPES,
      error: "No access token available",
    };
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`,
    );

    const data = await response.json();

    if (data.error) {
      logger.error("Invalid token or Google API error", {
        emailAccountId,
        error: data.error,
      });
      return {
        hasAllPermissions: false,
        missingScopes: SCOPES, // Assume all scopes are missing if we can't check
        error: data.error,
      };
    }

    const grantedScopes = data.scope?.split(" ") || [];
    const missingScopes = SCOPES.filter(
      (scope) => !grantedScopes.includes(scope),
    );

    const hasAllPermissions = missingScopes.length === 0;

    if (!hasAllPermissions)
      logger.info("Missing Gmail permissions", {
        emailAccountId,
        missingScopes,
      });

    return { hasAllPermissions, missingScopes };
  } catch (error) {
    logger.error("Error checking Gmail permissions", { emailAccountId, error });
    return {
      hasAllPermissions: false,
      missingScopes: SCOPES, // Assume all scopes are missing if we can't check
      error: "Failed to check permissions",
    };
  }
}

export async function handleGmailPermissionsCheck({
  accessToken,
  emailAccountId,
}: {
  accessToken: string;
  emailAccountId: string;
}) {
  const { hasAllPermissions, error, missingScopes } =
    await checkGmailPermissions({ accessToken, emailAccountId });

  if (error === "invalid_token") {
    logger.info("Cleaning up invalid Gmail tokens", { emailAccountId });
    // Clean up invalid tokens
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
    });
    if (!emailAccount)
      return { hasAllPermissions: false, error: "Email account not found" };

    await prisma.account.update({
      where: { id: emailAccount.accountId },
      data: {
        access_token: null,
        refresh_token: null,
        expires_at: null,
      },
    });
    return {
      hasAllPermissions: false,
      error: "Gmail access expired. Please reconnect your account.",
      missingScopes,
    };
  }

  return { hasAllPermissions, error, missingScopes };
}
