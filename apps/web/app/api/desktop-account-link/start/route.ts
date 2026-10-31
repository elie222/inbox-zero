import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/utils/middleware";
import { mobileAuthCodeChallengeSchema } from "@/utils/mobile-auth/pkce";
import { createDesktopLinkingState } from "@/utils/oauth/desktop-account-linking";
import {
  checkAccountLinkingStart,
  getGoogleLinkingAuthUrl,
  getMicrosoftLinkingAuthUrl,
} from "@/utils/oauth/linking-start";
import { createOAuthLinkingAuditLogger } from "@/utils/oauth/linking-audit";

const startDesktopAccountLinkSchema = z.object({
  provider: z.enum(["google", "microsoft"]),
  codeChallenge: mobileAuthCodeChallengeSchema,
  reconnectEmailAccountId: z.string().trim().min(1).max(256).optional(),
});

export const POST = withAuth("desktop-account-link/start", async (request) => {
  const body = startDesktopAccountLinkSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!body.success) {
    return NextResponse.json(
      { error: "Invalid request", isKnownError: true },
      { status: 400 },
    );
  }
  const { provider, codeChallenge } = body.data;
  const userId = request.auth.userId;

  const start = await checkAccountLinkingStart({
    request,
    provider,
    reconnectEmailAccountId: body.data.reconnectEmailAccountId ?? null,
  });
  if (start.response) return start.response;
  const { reconnectTarget } = start;

  const { state, stateNonce } = createDesktopLinkingState({
    userId,
    codeChallenge,
    reconnectEmailAccountId: reconnectTarget?.id ?? null,
  });
  const url =
    provider === "google"
      ? getGoogleLinkingAuthUrl({ state, reconnectTarget })
      : getMicrosoftLinkingAuthUrl({ state, reconnectTarget });

  createOAuthLinkingAuditLogger({
    actorUserId: userId,
    logger: request.logger,
    provider,
    stateNonce,
    targetUserId: userId,
  }).info("OAuth linking flow initiated", { desktop: true });

  const response = NextResponse.json({ url });
  response.headers.set("Cache-Control", "no-store");
  return response;
});
