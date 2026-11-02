import { env } from "@/env";
import { auth } from "@/utils/auth";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";
import { linkMicrosoftAccount } from "@/utils/outlook/link-account";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import {
  hasValidMatchingSignedOAuthState,
  validateOAuthCallback,
} from "@/utils/oauth/callback-validation";
import { getMailboxLinkingBlockedRedirect } from "@/utils/oauth/account-linking";
import { createAccountLinkingRedirect } from "@/utils/oauth/account-linking-redirect";
import {
  handOffDesktopAccountLink,
  parseDesktopLinkingState,
} from "@/utils/oauth/desktop-account-linking";
import { logOAuthLinkingCallbackValidation } from "@/utils/oauth/linking-audit";
import {
  classifyMicrosoftOAuthCallbackError,
  extractAadstsCode,
  getSafeMicrosoftOAuthErrorDescription,
} from "@/utils/oauth/microsoft-oauth";
import { SCOPES as OUTLOOK_SCOPES } from "@/utils/outlook/scopes";
import type { Logger } from "@/utils/logger";

export const GET = withError("outlook/linking/callback", async (request) => {
  const searchParams = request.nextUrl.searchParams;

  const desktopState = parseDesktopLinkingState(searchParams.get("state"));
  if (desktopState) {
    return handOffDesktopAccountLink({
      provider: "microsoft",
      state: desktopState,
      code: searchParams.get("error") ? null : searchParams.get("code"),
      logger: request.logger,
    });
  }

  const actorSession = await auth(request.headers);
  const actorUserId = actorSession?.user.id ?? null;
  let logger = request.logger.with({
    actorUserId,
    auditType: "oauth_linking",
    hasActorSession: !!actorUserId,
    provider: "microsoft",
  });
  const linkingRedirectUri = `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/linking/callback`;

  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET)
    throw new SafeError("Microsoft login not enabled");

  const storedState = request.cookies.get(
    OUTLOOK_LINKING_STATE_COOKIE_NAME,
  )?.value;
  const oauthError = searchParams.get("error");
  const oauthErrorDescription = searchParams.get("error_description");
  const receivedState = searchParams.get("state");

  if (oauthError) {
    const invalidStateResponse = validateMicrosoftOAuthErrorState({
      receivedState,
      storedState,
      logger,
    });
    if (invalidStateResponse) {
      return invalidStateResponse;
    }

    return handleMicrosoftOAuthAuthorizeError({
      oauthError,
      errorDescription: oauthErrorDescription,
      logger,
      redirectUri: linkingRedirectUri,
      requestedScopes: OUTLOOK_SCOPES,
    });
  }

  const validation = validateOAuthCallback({
    code: searchParams.get("code"),
    receivedState: searchParams.get("state"),
    storedState,
    stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
    logger,
  });

  if (!validation.success) {
    return validation.response;
  }

  const { targetUserId, code, stateNonce, reconnectEmailAccountId } =
    validation;
  logger = logOAuthLinkingCallbackValidation({
    actorUserId,
    logger,
    provider: "microsoft",
    stateNonce,
    targetUserId,
  });

  if (!actorUserId || actorUserId !== targetUserId) {
    return createAccountLinkingRedirect({
      query: { error: "invalid_state" },
      stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
    });
  }

  const blockedRedirect = getMailboxLinkingBlockedRedirect({
    session: actorSession,
    logger,
    stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
  });
  if (blockedRedirect) return blockedRedirect;

  return linkMicrosoftAccount({
    code,
    targetUserId,
    reconnectEmailAccountId,
    logger,
  });
});

function handleMicrosoftOAuthAuthorizeError(params: {
  oauthError: string;
  errorDescription: string | null;
  logger: Logger;
  redirectUri: string;
  requestedScopes: readonly string[];
}) {
  const mappedError = classifyMicrosoftOAuthCallbackError({
    oauthError: params.oauthError,
    errorDescription: params.errorDescription,
  });

  params.logger.warn("Microsoft authorize callback returned an OAuth error", {
    oauthError: params.oauthError,
    aadstsCode: extractAadstsCode(params.errorDescription),
    errorDescription: params.errorDescription,
    redirectUri: params.redirectUri,
    requestedScopes: params.requestedScopes,
    safeErrorDescription: getSafeMicrosoftOAuthErrorDescription(
      params.errorDescription,
    ),
  });

  if (mappedError) {
    return createAccountLinkingRedirect({
      query: {
        error: mappedError.errorCode,
        error_description: mappedError.userMessage,
      },
      stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
    });
  }

  return createAccountLinkingRedirect({
    query: {
      error: "link_failed",
      error_description: getSafeMicrosoftOAuthErrorDescription(
        params.errorDescription,
      ),
    },
    stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
  });
}

function validateMicrosoftOAuthErrorState(params: {
  receivedState: string | null;
  storedState: string | undefined;
  logger: Logger;
}) {
  if (
    hasValidMatchingSignedOAuthState({
      receivedState: params.receivedState,
      storedState: params.storedState,
      logger: params.logger,
    })
  ) {
    return null;
  }

  params.logger.warn("Invalid state during Microsoft OAuth error callback", {
    receivedState: params.receivedState,
    hasStoredState: !!params.storedState,
  });
  return createAccountLinkingRedirect({
    query: { error: "invalid_state" },
    stateCookieName: OUTLOOK_LINKING_STATE_COOKIE_NAME,
  });
}
