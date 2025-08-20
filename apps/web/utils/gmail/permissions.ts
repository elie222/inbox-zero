import { SCOPES } from "@/utils/gmail/scopes";
import {
  getAccessTokenFromClient,
  getGmailClientWithRefresh,
} from "@/utils/gmail/client";
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
  refreshToken,
  emailAccountId,
}: {
  accessToken: string;
  refreshToken: string | null | undefined;
  emailAccountId: string;
}) {
  const { hasAllPermissions, error, missingScopes } =
    await checkGmailPermissions({ accessToken, emailAccountId });

  if (error === "invalid_token") {
    // attempt to refresh the token one last time using only the refresh token
    if (refreshToken) {
      try {
        const gmailClient = await getGmailClientWithRefresh({
          accessToken: null,
          refreshToken,
          // force refresh even if existing expiry suggests it's valid
          expiresAt: null,
          emailAccountId,
        });

        // re-check permissions with the new access token
        const newAccessToken = getAccessTokenFromClient(gmailClient);
        return await checkGmailPermissions({
          accessToken: newAccessToken,
          emailAccountId,
        });
      } catch (refreshError) {
        // Log the specific error for debugging
        logger.warn("Failed to refresh Gmail token", {
          emailAccountId,
          error:
            refreshError instanceof Error
              ? refreshError.message
              : String(refreshError),
          isInvalidGrant:
            refreshError instanceof Error &&
            refreshError.message.includes("invalid_grant"),
        });

        // Only clear tokens if it's truly an invalid_grant error
        if (
          refreshError instanceof Error &&
          refreshError.message.includes("invalid_grant")
        ) {
          // This means the refresh token is actually invalid
          // Fall through to cleanup
        } else {
          // For other errors (network, temporary), don't clear tokens
          return {
            hasAllPermissions: false,
            error: "Temporary error checking permissions. Please try again.",
            missingScopes,
          };
        }
      }
    }

    // Only clear tokens if refresh truly failed
    logger.error("Gmail token refresh failed - user needs to re-authenticate", {
      emailAccountId,
      hasRefreshToken: !!refreshToken,
    });

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
    });
    if (!emailAccount)
      return { hasAllPermissions: false, error: "Email account not found" };

    // DON'T clear the refresh token! Only clear access token and expiry
    // The refresh token might still be valid, just temporarily failing
    await prisma.account.update({
      where: { id: emailAccount.accountId },
      data: {
        access_token: null,
        expires_at: null,
        // DO NOT CLEAR refresh_token here - it might still be valid!
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
