import { NextResponse } from "next/server";
import { getLinkingOAuth2Client } from "@/utils/gmail/client";
import { SCOPES } from "@/utils/gmail/scopes";
import type { Logger } from "@/utils/logger";
import {
  getMailboxLinkingBlockedResponse,
  hasActiveAccountLinkingUser,
} from "@/utils/oauth/account-linking";
import { findReconnectTarget } from "@/utils/oauth/reconnect-target";
import { getLinkingOAuth2Url } from "@/utils/outlook/client";

type ReconnectTarget = { id: string; email: string };

export async function checkAccountLinkingStart({
  request,
  provider,
  reconnectEmailAccountId,
}: {
  request: { auth: { userId: string; emailOtp?: boolean }; logger: Logger };
  provider: "google" | "microsoft";
  reconnectEmailAccountId: string | null;
}): Promise<
  | { response: NextResponse }
  | { response?: undefined; reconnectTarget: ReconnectTarget | null }
> {
  const userId = request.auth.userId;

  const blockedResponse = getMailboxLinkingBlockedResponse(request);
  if (blockedResponse) return { response: blockedResponse };

  const hasActiveUser = await hasActiveAccountLinkingUser({
    targetUserId: userId,
    logger: request.logger,
  });

  if (!hasActiveUser) {
    return {
      response: NextResponse.json(
        { error: "Unauthorized", isKnownError: true, redirectTo: "/logout" },
        { status: 401 },
      ),
    };
  }

  const reconnectTarget = reconnectEmailAccountId
    ? await findReconnectTarget({
        emailAccountId: reconnectEmailAccountId,
        userId,
        provider,
      })
    : null;

  // Falling back to an unconstrained link would reconnect whichever mailbox the
  // browser is signed into, which is the outcome the target exists to prevent.
  if (reconnectEmailAccountId && !reconnectTarget) {
    return {
      response: NextResponse.json(
        { error: "Account not found", isKnownError: true },
        { status: 404 },
      ),
    };
  }

  return { reconnectTarget };
}

export function getGoogleLinkingAuthUrl({
  state,
  reconnectTarget,
}: {
  state: string;
  reconnectTarget: ReconnectTarget | null;
}) {
  return getLinkingOAuth2Client().generateAuthUrl({
    access_type: "offline",
    scope: [...new Set([...SCOPES, "openid", "email"])].join(" "),
    prompt: "consent",
    state,
    // Reconnects target one mailbox, so point Google at it rather than letting
    // whichever account the browser is already signed into decide.
    ...(reconnectTarget && { login_hint: reconnectTarget.email }),
  });
}

export function getMicrosoftLinkingAuthUrl({
  state,
  reconnectTarget,
}: {
  state: string;
  reconnectTarget: ReconnectTarget | null;
}) {
  const baseUrl = getLinkingOAuth2Url({ loginHint: reconnectTarget?.email });
  return `${baseUrl}&state=${state}`;
}
