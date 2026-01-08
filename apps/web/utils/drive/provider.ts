import type { DriveConnection } from "@/generated/prisma/client";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { DriveProvider } from "@/utils/drive/types";
import type { Logger } from "@/utils/logger";
import { OneDriveProvider } from "@/utils/drive/providers/microsoft";
import { GoogleDriveProvider } from "@/utils/drive/providers/google";
import { MICROSOFT_DRIVE_SCOPES } from "@/utils/drive/scopes";
import { SafeError } from "@/utils/error";
import { env } from "@/env";
import prisma from "@/utils/prisma";

type OAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

/**
 * Internal factory function to create the appropriate DriveProvider based on connection type.
 * External code should use createDriveProviderWithRefresh to handle token expiration.
 */
function createDriveProvider(
  connection: Pick<DriveConnection, "provider" | "accessToken">,
  logger: Logger,
): DriveProvider {
  const { provider, accessToken } = connection;

  if (!accessToken) {
    throw new Error("No access token available for drive connection");
  }

  if (isMicrosoftProvider(provider)) {
    return new OneDriveProvider(accessToken, logger);
  }

  if (isGoogleProvider(provider)) {
    return new GoogleDriveProvider(accessToken, logger);
  }

  throw new Error(`Unsupported drive provider: ${provider}`);
}

/**
 * Factory function that handles token refresh for drive connections.
 * Similar to getCalendarClientWithRefresh.
 */
export async function createDriveProviderWithRefresh(
  connection: Pick<
    DriveConnection,
    "id" | "provider" | "accessToken" | "refreshToken" | "expiresAt"
  >,
  logger: Logger,
): Promise<DriveProvider> {
  const { provider, accessToken, refreshToken, expiresAt } = connection;

  if (!refreshToken) {
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

  // Check if token is still valid (with 5 min buffer)
  const bufferMs = 5 * 60 * 1000;
  const expiresAtMs = expiresAt ? expiresAt.getTime() : 0;
  if (accessToken && expiresAtMs > Date.now() + bufferMs) {
    return createDriveProvider({ provider, accessToken }, logger);
  }

  // Token is expired or missing, need to refresh
  if (isMicrosoftProvider(provider)) {
    const newAccessToken = await refreshMicrosoftDriveToken(connection, logger);
    return new OneDriveProvider(newAccessToken, logger);
  }

  if (isGoogleProvider(provider)) {
    const newAccessToken = await refreshGoogleDriveToken(connection, logger);
    return new GoogleDriveProvider(newAccessToken, logger);
  }

  throw new Error(`Unsupported drive provider: ${provider}`);
}

async function refreshMicrosoftDriveToken(
  connection: Pick<DriveConnection, "id" | "refreshToken">,
  logger: Logger,
): Promise<string> {
  const { id: connectionId, refreshToken } = connection;

  if (!refreshToken) {
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

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
        scope: MICROSOFT_DRIVE_SCOPES.join(" "),
      }),
    },
  );

  let tokens: OAuthTokenResponse;
  try {
    tokens = await response.json();
  } catch {
    logger.warn("Microsoft drive token refresh returned non-JSON response", {
      connectionId,
      status: response.status,
    });
    await markDriveConnectionAsDisconnected(connectionId);
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

  if (!response.ok) {
    const errorMessage = tokens.error_description || "Failed to refresh token";
    logger.warn("Microsoft drive token refresh failed", {
      connectionId,
      error: errorMessage,
    });
    await markDriveConnectionAsDisconnected(connectionId);
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

  if (!tokens.access_token) {
    logger.warn("Microsoft token refresh did not return access_token", {
      connectionId,
    });
    await markDriveConnectionAsDisconnected(connectionId);
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

  // Save new tokens
  const expiresIn = Number(tokens.expires_in);
  await saveDriveTokens({
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Number.isFinite(expiresIn)
        ? Math.floor(Date.now() / 1000 + expiresIn)
        : undefined,
    },
    connectionId,
    logger,
  });

  return tokens.access_token;
}

async function refreshGoogleDriveToken(
  connection: Pick<DriveConnection, "id" | "refreshToken">,
  logger: Logger,
): Promise<string> {
  const { id: connectionId, refreshToken } = connection;

  if (!refreshToken) {
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Google login not enabled - missing credentials");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  let tokens: OAuthTokenResponse;
  try {
    tokens = await response.json();
  } catch {
    logger.warn("Google drive token refresh returned non-JSON response", {
      connectionId,
      status: response.status,
    });
    await markDriveConnectionAsDisconnected(connectionId);
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

  if (!response.ok) {
    const errorMessage = tokens.error_description || "Failed to refresh token";
    logger.warn("Google drive token refresh failed", {
      connectionId,
      error: errorMessage,
    });
    await markDriveConnectionAsDisconnected(connectionId);
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

  if (!tokens.access_token) {
    logger.warn("Google token refresh did not return access_token", {
      connectionId,
    });
    await markDriveConnectionAsDisconnected(connectionId);
    throw new SafeError(
      "Unable to access your drive. Please reconnect your drive and try again.",
    );
  }

  // Save new tokens (Google doesn't return a new refresh_token)
  const expiresIn = Number(tokens.expires_in);
  await saveDriveTokens({
    tokens: {
      access_token: tokens.access_token,
      expires_at: Number.isFinite(expiresIn)
        ? Math.floor(Date.now() / 1000 + expiresIn)
        : undefined,
    },
    connectionId,
    logger,
  });

  return tokens.access_token;
}

async function saveDriveTokens({
  tokens,
  connectionId,
  logger,
}: {
  tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_at?: number; // seconds
  };
  connectionId: string;
  logger: Logger;
}) {
  if (!tokens.access_token) {
    logger.warn("No access token to save for drive connection", {
      connectionId,
    });
    return;
  }

  try {
    await prisma.driveConnection.update({
      where: { id: connectionId },
      data: {
        accessToken: tokens.access_token,
        ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
        expiresAt: tokens.expires_at
          ? new Date(tokens.expires_at * 1000)
          : null,
        isConnected: true,
      },
    });

    logger.info("Drive tokens saved successfully", { connectionId });
  } catch (error) {
    logger.error("Failed to save drive tokens", { error, connectionId });
    throw error;
  }
}

async function markDriveConnectionAsDisconnected(connectionId: string) {
  await prisma.driveConnection.update({
    where: { id: connectionId },
    data: { isConnected: false },
  });
}
