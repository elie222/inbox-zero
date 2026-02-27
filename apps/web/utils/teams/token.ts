import type { MessagingChannel } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { TEAMS_SCOPES, TEAMS_TOKEN_REFRESH_BUFFER_MS } from "./constants";
import { getTeamsOAuthBaseUrl, getTeamsOAuthCredentials } from "./oauth";

type TeamsTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
};

export async function getTeamsAccessToken({
  channel,
  logger,
}: {
  channel: Pick<
    MessagingChannel,
    "id" | "accessToken" | "refreshToken" | "expiresAt"
  >;
  logger: Logger;
}): Promise<string> {
  if (
    channel.accessToken &&
    channel.expiresAt &&
    channel.expiresAt.getTime() > Date.now() + TEAMS_TOKEN_REFRESH_BUFFER_MS
  ) {
    return channel.accessToken;
  }

  if (channel.accessToken && !channel.expiresAt) {
    return channel.accessToken;
  }

  return refreshTeamsAccessToken({ channel, logger });
}

export async function refreshTeamsAccessToken({
  channel,
  logger,
}: {
  channel: Pick<MessagingChannel, "id" | "refreshToken">;
  logger: Logger;
}): Promise<string> {
  if (!channel.refreshToken) {
    throw new SafeError(
      "Unable to access Microsoft Teams. Reconnect Teams and try again.",
    );
  }

  const { clientId, clientSecret } = getTeamsOAuthCredentials();

  const response = await fetch(`${getTeamsOAuthBaseUrl()}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: channel.refreshToken,
      grant_type: "refresh_token",
      scope: TEAMS_SCOPES,
    }),
  });

  const tokens = (await response
    .json()
    .catch(() => ({}))) as TeamsTokenResponse;

  if (!response.ok || !tokens.access_token) {
    logger.warn("Teams token refresh failed", {
      channelId: channel.id,
      error: tokens.error,
      errorDescription: tokens.error_description,
    });

    throw new SafeError(
      "Unable to access Microsoft Teams. Reconnect Teams and try again.",
    );
  }

  const expiresInSeconds = Number(tokens.expires_in ?? 0);
  const expiresAt =
    Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? new Date(Date.now() + expiresInSeconds * 1000)
      : null;

  await prisma.messagingChannel.update({
    where: { id: channel.id },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? channel.refreshToken,
      expiresAt,
    },
  });

  return tokens.access_token;
}
