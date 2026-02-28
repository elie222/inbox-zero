import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { MessagingProvider } from "@/generated/prisma/enums";
import { prefixPath } from "@/utils/path";
import {
  RedirectError,
  redirectWithError,
  redirectWithMessage,
} from "@/utils/oauth/redirect";
import { parseOAuthState } from "@/utils/oauth/state";
import {
  acquireOAuthCodeLock,
  clearOAuthCode,
  getOAuthCodeResult,
  setOAuthCodeResult,
} from "@/utils/redis/oauth-code";
import {
  TEAMS_OAUTH_STATE_TYPE,
  TEAMS_SCOPES,
  TEAMS_STATE_COOKIE_NAME,
} from "./constants";
import {
  getTeamsOAuthBaseUrl,
  getTeamsOAuthCredentials,
  getTeamsRedirectUri,
} from "./oauth";

const teamsOAuthStateSchema = z.object({
  emailAccountId: z.string().min(1).max(64),
  type: z.literal(TEAMS_OAUTH_STATE_TYPE),
  nonce: z.string().min(8).max(128),
});

const teamsTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.union([z.number(), z.string()]).optional(),
  id_token: z.string().optional(),
});

const teamsProfileSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().optional(),
});

export async function handleTeamsCallback(
  request: NextRequest,
  logger: Logger,
): Promise<NextResponse> {
  let redirectHeaders = new Headers();
  let codeForCleanup: string | null = null;
  let callbackLogger = logger;

  try {
    const { code, redirectUrl, response, receivedState } =
      validateOAuthCallback(request, logger);
    codeForCleanup = code;
    redirectHeaders = response.headers;

    const decodedState = parseAndValidateState(
      receivedState,
      logger,
      redirectUrl,
      response.headers,
    );

    const { emailAccountId } = decodedState;
    callbackLogger = logger.with({ emailAccountId });

    const finalRedirectUrl = new URL(
      prefixPath(emailAccountId, "/settings"),
      env.NEXT_PUBLIC_BASE_URL,
    );

    const cachedResult = await getOAuthCodeResult(code);
    if (cachedResult) {
      for (const [key, value] of Object.entries(cachedResult.params)) {
        finalRedirectUrl.searchParams.set(key, value);
      }

      return NextResponse.redirect(finalRedirectUrl, {
        headers: redirectHeaders,
      });
    }

    const acquiredLock = await acquireOAuthCodeLock(code);
    if (!acquiredLock) {
      finalRedirectUrl.searchParams.set("message", "processing");
      return NextResponse.redirect(finalRedirectUrl, {
        headers: redirectHeaders,
      });
    }

    const tokens = await exchangeCodeForTokens(code);
    const profile = await fetchCurrentUserProfile(tokens.access_token);

    const tenantId = extractTenantId(tokens.id_token) ?? profile.id;
    const expiresAt = parseExpiresAt(tokens.expires_in);

    await prisma.messagingChannel.upsert({
      where: {
        emailAccountId_provider_teamId: {
          emailAccountId,
          provider: MessagingProvider.TEAMS,
          teamId: tenantId,
        },
      },
      update: {
        teamName: "Microsoft Teams",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt,
        providerUserId: profile.id,
        botUserId: null,
        isConnected: true,
      },
      create: {
        provider: MessagingProvider.TEAMS,
        teamId: tenantId,
        teamName: "Microsoft Teams",
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        expiresAt,
        providerUserId: profile.id,
        botUserId: null,
        emailAccountId,
        isConnected: true,
      },
    });

    await setOAuthCodeResult(code, { message: "teams_connected" });

    return redirectWithMessage(
      finalRedirectUrl,
      "teams_connected",
      redirectHeaders,
    );
  } catch (error) {
    if (codeForCleanup) {
      await clearOAuthCode(codeForCleanup);
    }

    if (error instanceof RedirectError) {
      return redirectWithError(
        error.redirectUrl,
        "connection_failed",
        error.responseHeaders,
      );
    }

    callbackLogger.error("Error in Teams callback", { error });

    const fallbackUrl = new URL("/settings", env.NEXT_PUBLIC_BASE_URL);
    fallbackUrl.searchParams.set("error", "connection_failed");
    fallbackUrl.searchParams.set("error_reason", "unexpected_error");

    return NextResponse.redirect(fallbackUrl, {
      headers: redirectHeaders,
    });
  }
}

function validateOAuthCallback(request: NextRequest, logger: Logger) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const storedState = request.cookies.get(TEAMS_STATE_COOKIE_NAME)?.value;

  const redirectUrl = new URL("/settings", env.NEXT_PUBLIC_BASE_URL);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.delete(TEAMS_STATE_COOKIE_NAME);

  if (oauthError) {
    logger.warn("Teams callback returned OAuth error", { oauthError });
    redirectUrl.searchParams.set(
      "error",
      `oauth_${sanitizeReason(oauthError)}`,
    );
    throw new RedirectError(redirectUrl, response.headers);
  }

  if (!code || code.length < 10) {
    redirectUrl.searchParams.set("error", "missing_code");
    throw new RedirectError(redirectUrl, response.headers);
  }

  if (!receivedState || !storedState || storedState !== receivedState) {
    redirectUrl.searchParams.set("error", "invalid_state");
    throw new RedirectError(redirectUrl, response.headers);
  }

  return { code, receivedState, redirectUrl, response };
}

function parseAndValidateState(
  receivedState: string,
  logger: Logger,
  redirectUrl: URL,
  responseHeaders: Headers,
) {
  try {
    const rawState = parseOAuthState<{
      emailAccountId: string;
      type: typeof TEAMS_OAUTH_STATE_TYPE;
    }>(receivedState);

    const parsed = teamsOAuthStateSchema.safeParse(rawState);
    if (!parsed.success) {
      logger.error("Teams state validation failed", {
        errors: parsed.error.errors,
      });
      redirectUrl.searchParams.set("error", "invalid_state_format");
      throw new RedirectError(redirectUrl, responseHeaders);
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof RedirectError) throw error;

    logger.error("Failed to decode Teams OAuth state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    throw new RedirectError(redirectUrl, responseHeaders);
  }
}

async function exchangeCodeForTokens(code: string) {
  const { clientId, clientSecret } = getTeamsOAuthCredentials();
  const redirectUri = getTeamsRedirectUri();

  const response = await fetch(`${getTeamsOAuthBaseUrl()}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: TEAMS_SCOPES,
    }),
  });

  const raw = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error =
      typeof raw?.error_description === "string"
        ? raw.error_description
        : typeof raw?.error === "string"
          ? raw.error
          : "Token exchange failed";
    throw new Error(error);
  }

  const parsed = teamsTokenResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid Teams OAuth response");
  }

  return parsed.data;
}

async function fetchCurrentUserProfile(accessToken: string) {
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me?$select=id,displayName",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error("Failed to fetch Microsoft profile");
  }

  const raw = await response.json();
  const parsed = teamsProfileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Invalid Microsoft profile response");
  }

  return parsed.data;
}

function parseExpiresAt(expiresIn: number | string | undefined): Date | null {
  const seconds = Number(expiresIn ?? 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;

  return new Date(Date.now() + seconds * 1000);
}

function extractTenantId(idToken: string | undefined): string | null {
  if (!idToken) return null;

  const [, payload] = idToken.split(".");
  if (!payload) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(
        payload.replaceAll("-", "+").replaceAll("_", "/"),
        "base64",
      ).toString("utf8"),
    ) as { tid?: string };

    if (!decoded.tid) return null;

    return decoded.tid;
  } catch {
    return null;
  }
}

function sanitizeReason(reason: string): string {
  return reason
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .slice(0, 80);
}
