import { NextResponse } from "next/server";
import { z } from "zod";
import { secureCompare } from "@/utils/crypto-compare";
import { linkGoogleAccount } from "@/utils/gmail/link-account";
import { withAuth } from "@/utils/middleware";
import {
  getMobileAuthCodeChallenge,
  mobileAuthCodeVerifierSchema,
} from "@/utils/mobile-auth/pkce";
import { getMailboxLinkingBlockedResponse } from "@/utils/oauth/account-linking";
import { getAccountLinkingRedirectPath } from "@/utils/oauth/desktop-account-linking";
import { createOAuthLinkingAuditLogger } from "@/utils/oauth/linking-audit";
import { linkMicrosoftAccount } from "@/utils/outlook/link-account";
import { consumeDesktopAccountLinkHandoff } from "@/utils/redis/desktop-account-link";

const completeDesktopAccountLinkSchema = z.object({
  code: z.string().trim().min(1).max(256),
  codeVerifier: mobileAuthCodeVerifierSchema,
});

export const POST = withAuth(
  "desktop-account-link/complete",
  async (request) => {
    const body = completeDesktopAccountLinkSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!body.success) return rejectHandoff(400);

    const blockedResponse = getMailboxLinkingBlockedResponse(request);
    if (blockedResponse) return blockedResponse;

    const actorUserId = request.auth.userId;
    const handoff = await consumeDesktopAccountLinkHandoff(body.data.code);
    if (!handoff) {
      request.logger.warn("Desktop account link handoff rejected", {
        reason: "missing_or_used",
      });
      return rejectHandoff(400);
    }

    const logger = createOAuthLinkingAuditLogger({
      actorUserId,
      logger: request.logger,
      provider: handoff.provider,
      stateNonce: handoff.stateNonce,
      targetUserId: handoff.userId,
    });

    if (
      !secureCompare(
        getMobileAuthCodeChallenge(body.data.codeVerifier),
        handoff.codeChallenge,
      )
    ) {
      logger.warn("Desktop account link handoff rejected", {
        reason: "verifier_mismatch",
      });
      return rejectHandoff(400);
    }

    if (actorUserId !== handoff.userId) {
      logger.warn("Desktop account link handoff rejected", {
        reason: "actor_mismatch",
      });
      return rejectHandoff(403);
    }

    logger.info("OAuth linking callback validated", { desktop: true });

    const linkAccount =
      handoff.provider === "google" ? linkGoogleAccount : linkMicrosoftAccount;
    const linkResponse = await linkAccount({
      code: handoff.providerCode,
      targetUserId: handoff.userId,
      reconnectEmailAccountId: handoff.reconnectEmailAccountId,
      logger,
    });

    const response = NextResponse.json({
      redirectPath: getAccountLinkingRedirectPath(linkResponse),
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  },
);

function rejectHandoff(status: 400 | 403) {
  return NextResponse.json(
    {
      error: "Connecting the account did not finish. Please try again.",
      isKnownError: true,
    },
    { status },
  );
}
