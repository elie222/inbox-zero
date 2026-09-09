import { createHash } from "node:crypto";
import type { Logger } from "@/utils/logger";
import {
  claimOAuthCodeAndWait,
  clearOAuthCode,
  isOAuthCodeStoreConfigured,
  type OAuthCodeResult,
  setOAuthCodeResult,
} from "@/utils/redis/oauth-code";
import { WELCOME_PATH } from "@/utils/config";
import { env } from "@/env";

const CALLBACK_PATH_REGEX = /\/api\/auth\/(?:oauth2\/)?callback\/([^/]+)\/?$/;
const CALLBACK_RESULT_TTL_SECONDS = 600;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const OAUTH_STATE_COOKIE_NAMES = new Set([
  "__Secure-better-auth.oauth_state",
  "better-auth.oauth_state",
]);

export async function deduplicateOAuthCallback({
  request,
  handleRequest,
  logger,
}: {
  request: Request;
  handleRequest: () => Promise<Response>;
  logger: Logger;
}) {
  const callback = getOAuthCallback(request);
  if (!callback || !isOAuthCodeStoreConfigured()) return handleRequest();

  const { code, provider } = callback;
  const requestFingerprint = getOAuthStateFingerprint(request);
  if (!requestFingerprint) return handleRequest();

  const claim = await claimOAuthCodeAndWait(code, requestFingerprint);
  if (claim.status === "error" && claim.stage === "claim") {
    logger.warn("OAuth callback deduplication unavailable", {
      error: claim.error,
      provider,
    });
    return handleRequest();
  }

  if (claim.status === "error") {
    logger.warn("Failed while waiting for OAuth callback result", {
      error: claim.error,
      provider,
    });
    return Response.redirect(getPublicRedirectUrl(), 302);
  }

  if (claim.status === "success") {
    logger.info(
      claim.waited
        ? "Reusing in-flight OAuth callback result"
        : "Reusing completed OAuth callback",
      { provider },
    );
    return createCachedRedirect({
      requestFingerprint,
      result: claim.result,
    });
  }

  if (claim.status === "timeout") {
    logger.warn("OAuth callback wait timed out", { provider });
    return Response.redirect(getPublicRedirectUrl(), 302);
  }

  try {
    const response = await handleRequest();
    const location = response.headers.get("location");

    if (location && REDIRECT_STATUSES.has(response.status)) {
      try {
        const params: Record<string, string> = {
          redirect: location,
          status: response.status.toString(),
        };
        const setCookies = getSetCookieHeaders(response.headers);
        if (setCookies.length > 0) {
          params.setCookies = JSON.stringify(setCookies);
        }

        await setOAuthCodeResult(code, params, {
          requestFingerprint,
          ttlSeconds: CALLBACK_RESULT_TTL_SECONDS,
        });
      } catch (error) {
        logger.warn("Failed to cache OAuth callback result", {
          error,
          provider,
        });
      }
    } else {
      await clearOAuthCode(code);
    }

    return response;
  } catch (error) {
    await clearOAuthCode(code);
    throw error;
  }
}

function getOAuthCallback(request: Request) {
  if (request.method !== "GET") return null;
  if (
    !request.url.includes("/api/auth/") ||
    !request.url.includes("/callback/")
  ) {
    return null;
  }

  const url = new URL(request.url);
  const match = url.pathname.match(CALLBACK_PATH_REGEX);
  const code = url.searchParams.get("code");
  const provider = match?.[1];

  if (!code || !provider) return null;

  return { code, provider };
}

function createCachedRedirect({
  requestFingerprint,
  result,
}: {
  requestFingerprint?: string;
  result: OAuthCodeResult;
}) {
  const { params } = result;
  const redirect = params.redirect;
  const status = Number(params.status);

  if (!redirect) {
    return Response.redirect(getPublicRedirectUrl(), 302);
  }

  const redirectUrl = getPublicRedirectUrl(redirect);
  const redirectStatus = REDIRECT_STATUSES.has(status) ? status : 302;
  const headers = new Headers({ location: redirectUrl.toString() });

  if (
    requestFingerprint &&
    requestFingerprint === result.requestFingerprint &&
    params.setCookies
  ) {
    for (const cookie of parseSetCookies(params.setCookies)) {
      headers.append("set-cookie", cookie);
    }
  }

  return new Response(null, { headers, status: redirectStatus });
}

function getSetCookieHeaders(headers: Headers) {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] })
    .getSetCookie;

  return getSetCookie?.call(headers) ?? [];
}

function getOAuthStateFingerprint(request: Request) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return;

  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator === -1) continue;

    const name = cookie.slice(0, separator).trim();
    if (!OAUTH_STATE_COOKIE_NAMES.has(name)) continue;

    const value = cookie.slice(separator + 1);
    if (!value) return;

    return createHash("sha256").update(value).digest("hex");
  }
}

function parseSetCookies(value: string) {
  try {
    const cookies = JSON.parse(value) as unknown;
    return Array.isArray(cookies) &&
      cookies.every((cookie) => typeof cookie === "string")
      ? cookies
      : [];
  } catch {
    return [];
  }
}

function getPublicRedirectUrl(path = WELCOME_PATH) {
  return new URL(path, env.NEXT_PUBLIC_BASE_URL);
}
