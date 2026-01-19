import type { DriveConnection } from "@/generated/prisma/client";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import {
  saveDriveTokens,
  markDriveConnectionAsDisconnected,
} from "@/utils/drive/providers/token-helpers";

export async function refreshGoogleDriveToken(
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

  const tokens = await response.json();

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

  // Save new tokens (Google doesn't return a new refresh_token)
  await saveDriveTokens({
    tokens: {
      access_token: tokens.access_token,
      expires_at: Math.floor(Date.now() / 1000 + Number(tokens.expires_in)),
    },
    connectionId,
    logger,
  });

  return tokens.access_token;
}
