import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/utils/middleware";
import {
  createMobileAuthCode,
  getMobileAuthFlowId,
  isValidMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";
import { mobileAuthCodeChallengeSchema } from "@/utils/mobile-auth/pkce";

const handoffSchema = z.object({
  codeChallenge: mobileAuthCodeChallengeSchema,
  state: z.string().trim().refine(isValidMobileAuthState, "Invalid state"),
});

// Lets the signed-in desktop app hand its session to a companion app, which
// redeems the code at /api/mobile-auth/exchange-code with its PKCE verifier.
export const POST = withAuth("mobile-auth/handoff", async (request) => {
  // A JSON content type forces a CORS preflight, so another site cannot mint
  // a code with the user's cookies via a simple form post.
  if (!isJsonRequest(request)) {
    return NextResponse.json(
      { error: "Expected a JSON request", isKnownError: true },
      { status: 415, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (request.auth.emailOtp) {
    request.logger.warn("Mobile auth handoff rejected", {
      reason: "email_otp_session",
    });
    return NextResponse.json(
      { error: "Sign in again to connect this app", isKnownError: true },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = handoffSchema.parse(await request.json());
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

function isJsonRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.split(";")[0]?.trim().toLowerCase() === "application/json";
}
