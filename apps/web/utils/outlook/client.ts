import { Client } from "@microsoft/microsoft-graph-client";
import type { User, Photo } from "@microsoft/microsoft-graph-types";
import { saveTokens } from "@/utils/auth";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import { SCOPES } from "@/utils/outlook/scopes";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("outlook/client");

type AuthOptions = {
  accessToken?: string | null;
  refreshToken?: string | null;
  expiryDate?: number | null;
  expiresAt?: number | null;
};

// Helper to create Microsoft Graph client with proper typing
const createGraphClient = (accessToken: string) => {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
};

export const getContactsClient = ({ accessToken }: AuthOptions) => {
  if (!accessToken) throw new SafeError("No access token provided");
  return createGraphClient(accessToken);
};

// Similar to Gmail's getGmailClientWithRefresh
export const getOutlookClientWithRefresh = async ({
  accessToken,
  refreshToken,
  expiresAt,
  emailAccountId,
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
}) => {
  if (!refreshToken) throw new SafeError("No refresh token");

  // Check if token needs refresh
  const expiryDate = expiresAt ? expiresAt * 1000 : null;
  if (accessToken && expiryDate && expiryDate > Date.now()) {
    return createGraphClient(accessToken);
  }

  // Refresh token
  try {
    const response = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
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
          scope: SCOPES.join(" "),
        }),
      },
    );

    const tokens = await response.json();

    if (!response.ok) {
      throw new Error(tokens.error_description || "Failed to refresh token");
    }

    // Save new tokens
    await saveTokens({
      tokens: {
        access_token: tokens.access_token,
        expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
      },
      accountRefreshToken: refreshToken,
      emailAccountId,
      provider: "microsoft-entra-id",
    });

    return createGraphClient(tokens.access_token);
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

export const getAccessTokenFromClient = (client: Client): string => {
  // This is a bit hacky but works - the client stores the token in its authProvider
  const accessToken = (client as any)._authProvider._token;
  if (!accessToken) throw new Error("No access token");
  return accessToken;
};

// Helper function to get the OAuth2 URL for linking accounts
export function getLinkingOAuth2Url() {
  const baseUrl =
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/linking/callback`,
    scope: SCOPES.join(" "),
  });

  return `${baseUrl}?${params.toString()}`;
}

// Helper types for common Microsoft Graph operations
export type GraphClient = ReturnType<typeof createGraphClient>;

// Example of a typed API call helper
export async function getUserProfile(client: GraphClient): Promise<User> {
  return await client
    .api("/me")
    .select("id,displayName,mail,userPrincipalName")
    .get();
}

export async function getUserPhoto(client: GraphClient): Promise<Photo | null> {
  try {
    return await client.api("/me/photo").get();
  } catch (error) {
    return null;
  }
}
