import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { withError } from "@/utils/middleware";
import {
  createMobileAuthCode,
  isValidMobileAuthState,
} from "@/utils/mobile-auth/oauth-code";
import {
  getMobileAuthAppCallbackUrl,
  type MobileAuthReturnUrlMode,
} from "@/utils/mobile-auth/url";

const mobileAuthReturnUrlModeSchema = z.enum(["app-link", "custom-scheme"]);
const callbackQuerySchema = z.object({
  state: z.string().trim().min(1).max(256),
  returnUrlMode: mobileAuthReturnUrlModeSchema.optional(),
});

export const GET = withError("mobile-auth/callback", async (request) => {
  const query = callbackQuerySchema.parse({
    state: request.nextUrl.searchParams.get("state"),
    returnUrlMode:
      request.nextUrl.searchParams.get("returnUrlMode") ?? undefined,
  });
  const returnUrlMode: MobileAuthReturnUrlMode =
    query.returnUrlMode ?? "app-link";

  if (!isValidMobileAuthState(query.state)) {
    throw new SafeError("Invalid authentication state", 400);
  }

  const session = await auth(request.headers);
  const userId = session?.user?.id;
  if (!userId) {
    return redirectToMobileCallback(
      query.state,
      {
        error: "missing_session",
        error_description: "Authentication session was not found",
      },
      returnUrlMode,
    );
  }

  const code = await createMobileAuthCode({
    state: query.state,
    userId,
  });

  request.logger.info("Created mobile auth code", {
    userId,
  });

  return redirectToMobileCallback(query.state, { code }, returnUrlMode);
});

function redirectToMobileCallback(
  state: string,
  params: Record<string, string>,
  returnUrlMode?: MobileAuthReturnUrlMode,
) {
  const redirectUrl = getMobileAuthAppCallbackUrl(returnUrlMode);
  redirectUrl.searchParams.set("state", state);
  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }

  const response = NextResponse.redirect(redirectUrl);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
