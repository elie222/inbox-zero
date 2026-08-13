import { SCOPES } from "@/utils/gmail/scopes";
import {
  getAccessTokenFromClient,
  getGmailClientWithRefresh,
} from "@/utils/gmail/client";
import {
  getGoogleTokenInfoUrl,
  isGoogleOauthEmulationEnabled,
} from "@/utils/google/oauth";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("Gmail Permissions");

const AUTH_ERRORS = [
  "invalid_token",
  "invalid_grant",
  "invalid_scope",
  "access_denied",
];

async function checkGmailPermissions({
  accessToken,
  emailAccountId,
  grantedScope,
}: {
  accessToken: string;
  emailAccountId: string;
  grantedScope?: string | null;
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

  if (isGoogleOauthEmulationEnabled()) {
    if (!grantedScope?.trim()) {
      logger.warn(
        "Missing stored Gmail scope in emulation, assuming permissions granted",
        { emailAccountId },
      );
      return {
        hasAllPermissions: true,
        missingScopes: [],
      };
    }

    const grantedScopes = grantedScope.split(/[,\s]+/).filter(Boolean);
    const missingScopes = SCOPES.filter(
      (scope) => !grantedScopes.includes(scope),
    );

    if (missingScopes.length > 0) {
      logger.info("Missing Gmail permissions", {
        emailAccountId,
        missingScopes,
      });
    }

    return {
      hasAllPermissions: missingScopes.length === 0,
      missingScopes,
    };
  }

  try {
    const response = await fetch(getGoogleTokenInfoUrl(accessToken));

    if (!response.ok && response.status >= 500) {
      throw new Error(
        `Token info request failed with status ${response.status}`,
      );
    }

    const data = await response.json();

    if (data.error) {
      if (!AUTH_ERRORS.includes(data.error)) {
        // Unrecognized error (rate-limit envelope, backend failure): not
        // confirmable as an auth failure, fail open rather than prompting re-auth
        throw new Error(
          `Token info request failed with error ${JSON.stringify(data.error)}`,
        );
      }

      // Recognized token error (4xx body, or error body on 200): fail closed
      // so the refresh flow can run
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

    if (!response.ok) {
      throw new Error(
        `Token info request failed with status ${response.status}`,
      );
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
      hasAllPermissions: true,
      missingScopes: [],
    };
  }
}

export async function handleGmailPermissionsCheck({
  accessToken,
  refreshToken,
  emailAccountId,
  grantedScope,
}: {
  accessToken: string;
  refreshToken: string | null | undefined;
  emailAccountId: string;
  grantedScope?: string | null;
}) {
  const permissionsBeforeRefresh = await checkGmailPermissions({
    accessToken,
    emailAccountId,
    grantedScope,
  });

  if (
    permissionsBeforeRefresh.error &&
    AUTH_ERRORS.includes(permissionsBeforeRefresh.error)
  ) {
    // attempt to refresh the token one last time using only the refresh token
    if (refreshToken) {
      try {
        const gmailClient = await getGmailClientWithRefresh({
          accessToken: null,
          refreshToken,
          // force refresh even if existing expiry suggests it's valid
          expiresAt: null,
          emailAccountId,
          logger,
        });

        // re-check permissions with the new access token
        const accessToken = getAccessTokenFromClient(gmailClient);
        const permissionsAfterRefresh = await checkGmailPermissions({
          accessToken,
          emailAccountId,
          grantedScope,
        });

        if (
          permissionsAfterRefresh.error &&
          permissionsAfterRefresh.error === "invalid_grant"
        ) {
          logger.info("Cleaning up invalid Gmail tokens", { emailAccountId });
          const emailAccount = await prisma.emailAccount.findUnique({
            where: { id: emailAccountId },
            select: { accountId: true },
          });
          if (!emailAccount)
            return {
              hasAllPermissions: false,
              error: "Email account not found",
            };

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
            missingScopes: permissionsBeforeRefresh.missingScopes,
          };
        }

        return permissionsAfterRefresh;
      } catch {
        return {
          hasAllPermissions: false,
          error: "Gmail access expired. Please reconnect your account.",
          missingScopes: permissionsBeforeRefresh.missingScopes,
        };
      }
    } else {
      logger.warn("Got no refresh token to attempt refresh", {
        emailAccountId,
      });
    }
  }

  return permissionsBeforeRefresh;
}
