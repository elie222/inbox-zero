import { SCOPES } from "@/utils/auth";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("Gmail Permissions");

// TODO: this can also error on network error
async function checkGmailPermissions({
  accessToken,
  email,
}: {
  accessToken: string;
  email: string;
}): Promise<{
  hasAllPermissions: boolean;
  missingScopes: string[];
  error?: string;
}> {
  if (!accessToken) {
    logger.error("No access token available", { email });
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
        email,
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

    logger.info("Gmail permissions check", {
      email,
      hasAllPermissions,
      missingScopes,
    });

    return { hasAllPermissions, missingScopes };
  } catch (error) {
    logger.error("Error checking Gmail permissions", { email, error });
    return {
      hasAllPermissions: false,
      missingScopes: SCOPES, // Assume all scopes are missing if we can't check
      error: "Failed to check permissions",
    };
  }
}

export async function handleGmailPermissionsCheck({
  accessToken,
  email,
  userId,
}: {
  accessToken: string;
  email: string;
  userId: string;
}) {
  const { hasAllPermissions, error, missingScopes } =
    await checkGmailPermissions({ accessToken, email });

  if (error === "invalid_token") {
    logger.info("Cleaning up invalid Gmail tokens", { email });
    // Clean up invalid tokens
    await prisma.account.update({
      where: {
        provider: "google",
        userId,
        user: { email },
      },
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
