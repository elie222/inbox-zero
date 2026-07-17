import type { Logger } from "@/utils/logger";
import {
  claimOAuthCode,
  clearOAuthCode,
  getOAuthCodeResult,
  isOAuthCodeStoreConfigured,
  setOAuthCodeResult,
} from "@/utils/redis/oauth-code";
import { WELCOME_PATH } from "@/utils/config";

const CALLBACK_PATH_REGEX = /\/api\/auth\/(?:oauth2\/)?callback\/([^/]+)\/?$/;
const CALLBACK_RESULT_POLL_INTERVAL_MS = 250;
const CALLBACK_RESULT_WAIT_MS = 15_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

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
  let claim: Awaited<ReturnType<typeof claimOAuthCode>>;

  try {
    claim = await claimOAuthCode(code);
  } catch (error) {
    logger.warn("OAuth callback deduplication unavailable", {
      error,
      provider,
    });
    return handleRequest();
  }

  if (typeof claim === "object") {
    logger.info("Reusing completed OAuth callback", { provider });
    return createCachedRedirect(request, claim.params);
  }

  if (claim === "processing") {
    logger.info("Waiting for in-flight OAuth callback", { provider });
    const inFlightResult = await waitForOAuthCodeResult({
      code,
      logger,
      provider,
    });

    if (inFlightResult) {
      logger.info("Reusing in-flight OAuth callback result", { provider });
      return createCachedRedirect(request, inFlightResult.params);
    }

    logger.warn("OAuth callback wait timed out", { provider });
    return Response.redirect(new URL(WELCOME_PATH, request.url), 302);
  }

  try {
    const response = await handleRequest();
    const location = response.headers.get("location");

    if (location && REDIRECT_STATUSES.has(response.status)) {
      try {
        await setOAuthCodeResult(code, {
          redirect: location,
          status: response.status.toString(),
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

async function waitForOAuthCodeResult({
  code,
  logger,
  provider,
}: {
  code: string;
  logger: Logger;
  provider: string;
}) {
  const attempts = CALLBACK_RESULT_WAIT_MS / CALLBACK_RESULT_POLL_INTERVAL_MS;

  for (let attempt = 0; attempt < attempts; attempt++) {
    await new Promise((resolve) =>
      setTimeout(resolve, CALLBACK_RESULT_POLL_INTERVAL_MS),
    );

    try {
      const result = await getOAuthCodeResult(code);
      if (result) return result;
    } catch (error) {
      logger.warn("Failed while waiting for OAuth callback result", {
        error,
        provider,
      });
      return null;
    }
  }

  return null;
}

function createCachedRedirect(
  request: Request,
  params: Record<string, string>,
) {
  const redirect = params.redirect;
  const status = Number(params.status);

  if (!redirect) {
    return Response.redirect(new URL(WELCOME_PATH, request.url), 302);
  }

  const redirectUrl = new URL(redirect, request.url);
  const redirectStatus = REDIRECT_STATUSES.has(status) ? status : 302;
  return Response.redirect(redirectUrl, redirectStatus);
}
