import { auth } from "@/utils/auth";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { linkGoogleAccount } from "@/utils/gmail/link-account";
import { withError } from "@/utils/middleware";
import { validateOAuthCallback } from "@/utils/oauth/callback-validation";
import { createAccountLinkingRedirect } from "@/utils/oauth/account-linking-redirect";
import {
  handOffDesktopAccountLink,
  parseDesktopLinkingState,
} from "@/utils/oauth/desktop-account-linking";
import { logOAuthLinkingCallbackValidation } from "@/utils/oauth/linking-audit";
import { getMailboxLinkingBlockedRedirect } from "@/utils/oauth/account-linking";

export const GET = withError("google/linking/callback", async (request) => {
  const searchParams = request.nextUrl.searchParams;

  const desktopState = parseDesktopLinkingState(searchParams.get("state"));
  if (desktopState) {
    return handOffDesktopAccountLink({
      provider: "google",
      state: desktopState,
      code: searchParams.get("code"),
      logger: request.logger,
    });
  }

  const actorSession = await auth(request.headers);
  const actorUserId = actorSession?.user.id ?? null;
  let logger = request.logger.with({
    actorUserId,
    auditType: "oauth_linking",
    hasActorSession: !!actorUserId,
    provider: "google",
  });

  const storedState = request.cookies.get(
    GOOGLE_LINKING_STATE_COOKIE_NAME,
  )?.value;

  const validation = validateOAuthCallback({
    code: searchParams.get("code"),
    receivedState: searchParams.get("state"),
    storedState,
    stateCookieName: GOOGLE_LINKING_STATE_COOKIE_NAME,
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
    provider: "google",
    stateNonce,
    targetUserId,
  });

  if (!actorUserId || actorUserId !== targetUserId) {
    return createAccountLinkingRedirect({
      query: { error: "invalid_state" },
      stateCookieName: GOOGLE_LINKING_STATE_COOKIE_NAME,
    });
  }

  const blockedRedirect = getMailboxLinkingBlockedRedirect({
    session: actorSession,
    logger,
    stateCookieName: GOOGLE_LINKING_STATE_COOKIE_NAME,
  });
  if (blockedRedirect) return blockedRedirect;

  return linkGoogleAccount({
    code,
    targetUserId,
    reconnectEmailAccountId,
    logger,
  });
});
