import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { withError } from "@/utils/middleware";
import {
  createMobileAuthCode,
  isValidMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";
import { getMobileAuthAppCallbackUrl } from "@/utils/mobile-auth/url";

const callbackQuerySchema = z.object({
  state: z.string().trim().min(1).max(256),
});

export const GET = withError("mobile-auth/callback", async (request) => {
  const query = callbackQuerySchema.parse({
    state: request.nextUrl.searchParams.get("state"),
  });

  if (!isValidMobileAuthState(query.state)) {
    throw new SafeError("Invalid authentication state", 400);
  }

  const session = await auth(request.headers);
  const userId = session?.user?.id;
  if (!userId) {
    return redirectToMobileCallback(query.state, {
      error: "missing_session",
      error_description: "Authentication session was not found",
    });
  }

  const code = await createMobileAuthCode({
    state: query.state,
    userId,
  });

  request.logger.info("Created mobile auth code", {
    userId,
  });

  return redirectToMobileCallback(query.state, { code });
});

function redirectToMobileCallback(
  state: string,
  params: Record<string, string>,
) {
  const redirectUrl = getMobileAuthAppCallbackUrl();
  redirectUrl.searchParams.set("state", state);
  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(redirectUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
