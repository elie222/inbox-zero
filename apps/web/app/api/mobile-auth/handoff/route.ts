import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/utils/middleware";
import {
  createMobileAuthCode,
  getMobileAuthFlowId,
  isValidMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";
import { mobileAuthCodeChallengeSchema } from "@/utils/mobile-auth/pkce";
import { checkRateLimit } from "@/utils/rate-limit";

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

  const rateLimit = await checkRateLimit({
    rule: {
      key: `rate-limit:mobile-auth-handoff:${request.auth.userId}`,
      limit: HANDOFF_LIMIT,
      windowSeconds: HANDOFF_WINDOW_SECONDS,
    },
    logger: request.logger,
  });
  if (rateLimit.limited) {
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

function isJsonRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.split(";")[0]?.trim().toLowerCase() === "application/json";
}
