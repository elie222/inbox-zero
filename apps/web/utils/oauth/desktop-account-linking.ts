import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import { mobileAuthCodeChallengeSchema } from "@/utils/mobile-auth/pkce";
import { getDesktopAccountLinkCallbackUrl } from "@/utils/mobile-auth/url";
import {
  generateSignedOAuthState,
  parseSignedOAuthState,
} from "@/utils/oauth/state";
import { storeDesktopAccountLinkHandoff } from "@/utils/redis/desktop-account-link";

// The desktop app starts linking inside Electron but the provider returns to
// the system browser, which has neither the state cookie nor the app's
// session. The state instead carries a PKCE challenge, and the browser only
// hands a one-time code back to the app, which proves itself with the
// verifier and its own session before anything is linked.
const desktopLinkingStateSchema = z.object({
  userId: z.string().min(1),
  nonce: z.string().min(1),
  desktop: z.literal(true),
  codeChallenge: mobileAuthCodeChallengeSchema,
  reconnectEmailAccountId: z.string().optional(),
});

type DesktopLinkingState = z.infer<typeof desktopLinkingStateSchema>;

export function createDesktopLinkingState({
  userId,
  codeChallenge,
  reconnectEmailAccountId,
}: {
  userId: string;
  codeChallenge: string;
  reconnectEmailAccountId: string | null;
}) {
  const stateNonce = randomUUID();
  const state = generateSignedOAuthState({
    userId,
    nonce: stateNonce,
    desktop: true,
    codeChallenge,
    ...(reconnectEmailAccountId && { reconnectEmailAccountId }),
  });
  return { state, stateNonce };
}

export function parseDesktopLinkingState(
  state: string | null,
): DesktopLinkingState | null {
  if (!state) return null;
  try {
    const parsed = desktopLinkingStateSchema.safeParse(
      parseSignedOAuthState(state),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function handOffDesktopAccountLink({
  provider,
  state,
  code,
  logger,
}: {
  provider: "google" | "microsoft";
  state: DesktopLinkingState;
  code: string | null;
  logger: Logger;
}) {
  const auditLogger = logger.with({
    auditType: "oauth_linking",
    desktop: true,
    provider,
    stateNonce: state.nonce,
    targetUserId: state.userId,
  });
  const redirectUrl = getDesktopAccountLinkCallbackUrl();

  if (code) {
    const handoffCode = await storeDesktopAccountLinkHandoff({
      provider,
      providerCode: code,
      userId: state.userId,
      codeChallenge: state.codeChallenge,
      stateNonce: state.nonce,
      reconnectEmailAccountId: state.reconnectEmailAccountId ?? null,
    });
    redirectUrl.searchParams.set("code", handoffCode);
    auditLogger.info("OAuth linking handed off to desktop app");
  } else {
    redirectUrl.searchParams.set("error", "link_failed");
    auditLogger.warn("Desktop OAuth linking returned without a code");
  }

  const response = NextResponse.redirect(redirectUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export function getAccountLinkingRedirectPath(response: NextResponse) {
  const location = response.headers.get("location");
  if (!location) return "/accounts";
  const url = new URL(location);
  return `${url.pathname}${url.search}`;
}
