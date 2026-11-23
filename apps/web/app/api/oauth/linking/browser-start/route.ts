import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { auth } from "@/utils/auth";
import { GOOGLE_LINKING_STATE_COOKIE_NAME } from "@/utils/gmail/constants";
import { withError } from "@/utils/middleware";
import { hasActiveAccountLinkingUser } from "@/utils/oauth/account-linking";
import { createAccountLinkingRedirect } from "@/utils/oauth/account-linking-redirect";
import { createOAuthLinkingAuditLogger } from "@/utils/oauth/linking-audit";
import { getAccountLinkingAuthorizationUrl } from "@/utils/oauth/linking-auth-url";
import { findReconnectTarget } from "@/utils/oauth/reconnect-target";
import {
  oauthStateCookieOptions,
  parseSignedOAuthState,
} from "@/utils/oauth/state";
import { OUTLOOK_LINKING_STATE_COOKIE_NAME } from "@/utils/outlook/constants";
import { buildLoginRedirectUrl } from "@/utils/redirect";

export const GET = withError("oauth/linking/browser-start", async (request) => {
  const provider = request.nextUrl.searchParams.get("provider");
  const state = request.nextUrl.searchParams.get("state");
  const invalidState = () =>
    createAccountLinkingRedirect({ query: { error: "invalid_state" } });
  if ((provider !== "google" && provider !== "microsoft") || !state) {
    return invalidState();
  }

  let payload: z.infer<typeof linkingStateSchema>;
  try {
    payload = linkingStateSchema.parse(parseSignedOAuthState(state));
  } catch {
    return invalidState();
  }
  if (payload.provider !== provider) {
    return invalidState();
  }

  const session = await auth(request.headers);
  if (!session) {
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`;
    return NextResponse.redirect(
      new URL(buildLoginRedirectUrl(next), env.NEXT_PUBLIC_BASE_URL),
    );
  }
  if (
    session.user.id !== payload.userId ||
    !(await hasActiveAccountLinkingUser({
      targetUserId: payload.userId,
      logger: request.logger,
    }))
  ) {
    return invalidState();
  }

  const reconnectTarget = payload.reconnectEmailAccountId
    ? await findReconnectTarget({
        emailAccountId: payload.reconnectEmailAccountId,
        userId: payload.userId,
        provider,
      })
    : null;
  if (payload.reconnectEmailAccountId && !reconnectTarget)
    return invalidState();

  createOAuthLinkingAuditLogger({
    actorUserId: session.user.id,
    logger: request.logger,
    provider,
    stateNonce: payload.nonce,
    targetUserId: payload.userId,
  }).info("OAuth linking handed off to system browser");

  const authorizationUrl = getAccountLinkingAuthorizationUrl({
    provider,
    state,
    loginHint: reconnectTarget?.email,
  });
  const response = NextResponse.redirect(authorizationUrl, 302);
  // The desktop cookie jar is separate from the browser that completes OAuth.
  response.cookies.set(
    provider === "google"
      ? GOOGLE_LINKING_STATE_COOKIE_NAME
      : OUTLOOK_LINKING_STATE_COOKIE_NAME,
    state,
    oauthStateCookieOptions,
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
});

const linkingStateSchema = z.object({
  type: z.literal("account-linking"),
  provider: z.enum(["google", "microsoft"]),
  userId: z.string().min(1),
  nonce: z.string(),
  reconnectEmailAccountId: z.string().min(1).optional(),
});
