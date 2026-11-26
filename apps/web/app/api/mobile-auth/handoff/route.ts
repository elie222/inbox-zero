import { NextResponse } from "next/server";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import { withAuth } from "@/utils/middleware";
import {
  createMobileAuthCode,
  getMobileAuthFlowId,
  isValidMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";
import { mobileAuthCodeChallengeSchema } from "@/utils/mobile-auth/pkce";
import { redis } from "@/utils/redis";

const HANDOFF_LIMIT = 10;
const HANDOFF_WINDOW_SECONDS = 10 * 60;

const handoffSchema = z.object({
  codeChallenge: mobileAuthCodeChallengeSchema,
  state: z.string().trim().refine(isValidMobileAuthState, "Invalid state"),
});

// Lets the signed-in desktop app hand its session to a companion app, which
// redeems the code at /api/mobile-auth/exchange-code with its PKCE verifier.
export const POST = withAuth("mobile-auth/handoff", async (request) => {
  // Only the app's own pages or a native client may mint a code. Browsers
  // mark sibling-subdomain and cross-site requests, and a JSON content type
  // forces a CORS preflight on any cross-origin fetch.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    request.logger.warn("Mobile auth handoff rejected", {
      reason: "cross_site",
      fetchSite,
    });
    return errorResponse("Cross-site request rejected", 403);
  }
  if (!isJsonRequest(request)) {
    return errorResponse("Expected a JSON request", 415);
  }

  if (request.auth.emailOtp) {
    request.logger.warn("Mobile auth handoff rejected", {
      reason: "email_otp_session",
    });
    return errorResponse("Sign in again to connect this app", 403);
  }

  const body = handoffSchema.parse(await request.json());

  if (await isHandoffRateLimited(request.auth.userId, request.logger)) {
    return errorResponse(
      "Too many sign-in attempts. Please try again later.",
      429,
    );
  }
  const code = await createMobileAuthCode({
    codeChallenge: body.codeChallenge,
    state: body.state,
    userId: request.auth.userId,
  });

  request.logger.info("Created mobile auth handoff code", {
    flowId: getMobileAuthFlowId(body.state),
  });

  return NextResponse.json(
    { code },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
});

function errorResponse(error: string, status: number) {
  return NextResponse.json(
    { error, isKnownError: true },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function isHandoffRateLimited(userId: string, logger: Logger) {
  const key = `mobile-auth-handoff:${userId}`;
  try {
    const count = Number(await redis.incr(key));
    if (count === 1) await redis.expire(key, HANDOFF_WINDOW_SECONDS);
    if (count <= HANDOFF_LIMIT) return false;
    logger.warn("Mobile auth handoff rejected", { reason: "rate_limited" });
    return true;
  } catch (error) {
    // Each code still needs the caller's session and PKCE verifier, so a
    // Redis outage should not block desktop sign-in.
    logger.warn("Mobile auth handoff rate limit check failed", { error });
    return false;
  }
}

function isJsonRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.split(";")[0]?.trim().toLowerCase() === "application/json";
}
