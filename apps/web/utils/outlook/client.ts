import { Client } from "@microsoft/microsoft-graph-client";
import type { User } from "@microsoft/microsoft-graph-types";
import { saveTokens } from "@/utils/auth";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { SCOPES } from "@/utils/outlook/scopes";
import { SafeError } from "@/utils/error";

// Add buffer time to prevent token expiry during long-running operations
const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000; // 10 minutes

// Wrapper class to hold both the Microsoft Graph client and its access token
export class OutlookClient {
  private readonly client: Client;
  private readonly accessToken: string;
  private readonly logger: Logger;
  private folderIdCache: Record<string, string> | null = null;

  constructor(accessToken: string, logger: Logger) {
    this.accessToken = accessToken;
    this.logger = logger;
    this.client = Client.init({
      authProvider: (done) => {
        done(null, this.accessToken);
      },
      defaultVersion: "v1.0",
      // Use immutable IDs to ensure message IDs remain stable
      // https://learn.microsoft.com/en-us/graph/outlook-immutable-id
      fetchOptions: {
        headers: {
          Prefer: 'IdType="ImmutableId"',
        },
      },
    });
  }

  getClient(): Client {
    return this.client;
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  getFolderIdCache(): Record<string, string> | null {
    return this.folderIdCache;
  }

  setFolderIdCache(cache: Record<string, string>): void {
    this.folderIdCache = cache;
  }

  // Helper methods for common operations
  async getUserProfile(): Promise<User> {
    return await this.client
      .api("/me")
      .select("id,displayName,mail,userPrincipalName")
      .get();
  }

  async getUserPhoto(): Promise<string | null> {
    try {
      const photoResponse = await this.client.api("/me/photo/$value").get();

      if (photoResponse) {
        const arrayBuffer = await photoResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        return `data:image/jpeg;base64,${base64}`;
      }
      return null;
    } catch {
      this.logger.warn("Error getting user photo");
      return null;
    }
  }
}

// Helper to create OutlookClient instance
export const createOutlookClient = (accessToken: string, logger: Logger) => {
  if (!accessToken) throw new SafeError("No access token provided");
  return new OutlookClient(accessToken, logger);
};

// Similar to Gmail's getGmailClientWithRefresh
export const getOutlookClientWithRefresh = async ({
  accessToken,
  refreshToken,
  expiresAt,
  emailAccountId,
  logger,
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
  logger: Logger;
}): Promise<OutlookClient> => {
  if (!refreshToken) {
    logger.error("No refresh token", { emailAccountId });
    throw new SafeError("No refresh token");
  }

  // Check if token needs refresh
  const expiryDate = expiresAt ? expiresAt : null;
  if (
    accessToken &&
    expiryDate &&
    expiryDate > Date.now() + TOKEN_REFRESH_BUFFER_MS
  ) {
    return createOutlookClient(accessToken, logger);
  }

  // Refresh token
  try {
    if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
      throw new Error("Microsoft login not enabled - missing credentials");
    }

    const response = await fetch(
      `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: env.MICROSOFT_CLIENT_ID,
          client_secret: env.MICROSOFT_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      },
    );

    const tokens = await response.json();

    if (!response.ok) {
      const errorMessage =
        tokens.error_description || "Failed to refresh token";

      // AADSTS7000215 = Invalid client secret
      // Happens when Azure AD client secret rotates or refresh token expires
      // Background processes (watch-manager) will catch and log this as a warning
      // User-facing flows will show an error prompting reconnection
      if (errorMessage.includes("AADSTS7000215")) {
        logger.warn(
          "Microsoft refresh token failed - user may need to reconnect",
          {
            emailAccountId,
          },
        );
      }

      // Microsoft identity platform errors that require user re-authentication:
      // AADSTS70000 = Scopes unauthorized or expired
      // AADSTS70008 = Refresh token expired due to inactivity
      // AADSTS70011 = Invalid scope
      // AADSTS700082 = Refresh token expired
      // AADSTS50173 = Invalid grant (refresh token revoked)
      // AADSTS65001 = User hasn't consented to permissions
      // AADSTS500011 = Resource principal not found (scope issue)
      // AADSTS54005 = Authorization code already redeemed
      // AADSTS50076 = MFA required (Conditional Access policy)
      // AADSTS50079 = MFA registration required
      // AADSTS50158 = External security challenge not satisfied
      // invalid_grant = General token refresh failure
      const requiresReauth =
        errorMessage.includes("AADSTS70000") ||
        errorMessage.includes("AADSTS70008") ||
        errorMessage.includes("AADSTS70011") ||
        errorMessage.includes("AADSTS700082") ||
        errorMessage.includes("AADSTS50173") ||
        errorMessage.includes("AADSTS65001") ||
        errorMessage.includes("AADSTS500011") ||
        errorMessage.includes("AADSTS54005") ||
        errorMessage.includes("AADSTS50076") ||
        errorMessage.includes("AADSTS50079") ||
        errorMessage.includes("AADSTS50158") ||
        errorMessage.includes("invalid_grant");

      if (requiresReauth) {
        logger.warn(
          "Microsoft authorization expired - user needs to reconnect",
          {
            emailAccountId,
            errorMessage,
          },
        );
        throw new SafeError(
          "Your Microsoft authorization has expired. Please sign out and log in again to reconnect your account.",
        );
      }

      throw new Error(errorMessage);
    }

    // Save new tokens
    await saveTokens({
      tokens: {
        access_token: tokens.access_token,
        expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
      },
      accountRefreshToken: refreshToken,
      emailAccountId,
      provider: "microsoft",
    });

    return createOutlookClient(tokens.access_token, logger);
  } catch (error) {
    const isInvalidGrantError =
      error instanceof Error &&
      (error.message.includes("invalid_grant") ||
        error.message.includes("AADSTS50173"));

    if (isInvalidGrantError) {
      logger.warn("Error refreshing Outlook access token", { error });
    }

    throw error;
  }
};

export const getAccessTokenFromClient = (client: OutlookClient): string => {
  return client.getAccessToken();
};

// Helper function to get the OAuth2 URL for linking accounts
export function getLinkingOAuth2Url() {
  if (!env.MICROSOFT_CLIENT_ID) {
    throw new Error("Microsoft login not enabled - missing client ID");
  }

  const baseUrl = `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`;
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/linking/callback`,
    scope: SCOPES.join(" "),
    prompt: "select_account",
  });

  return `${baseUrl}?${params.toString()}`;
}

// Helper types for common Microsoft Graph operations
export type { Client as GraphClient };
