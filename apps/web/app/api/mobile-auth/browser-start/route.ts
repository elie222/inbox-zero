import { NextResponse } from "next/server";
import { mobileAuthCodeChallengeSchema } from "@/utils/mobile-auth/pkce";
import { withError } from "@/utils/middleware";
import { startMobileSocialAuth } from "@/utils/mobile-auth/start-social";
import { mobileAuthProviderSchema } from "@/utils/mobile-auth/providers";
import { getMobileAuthBaseUrlOrigin } from "@/utils/mobile-auth/url";

export const GET = withError("mobile-auth/browser-start", async (request) => {
  const provider = mobileAuthProviderSchema.parse(
    request.nextUrl.searchParams.get("provider"),
  );
  const codeChallenge = mobileAuthCodeChallengeSchema.safeParse(
    request.nextUrl.searchParams.get("codeChallenge"),
  );
  if (!codeChallenge.success) {
    request.logger.warn("Desktop auth start rejected", {
      reason: "invalid_code_challenge",
      provider,
    });
    const response = NextResponse.redirect(
      new URL("/login/desktop-update-required", getMobileAuthBaseUrlOrigin()),
      302,
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

  const started = await startMobileSocialAuth({
    provider,
    codeChallenge: codeChallenge.data,
    returnUrlMode: "desktop-scheme",
  });

  const response = NextResponse.redirect(started.authorizationURL, 302);
  for (const cookie of started.setCookies) {
    response.headers.append("set-cookie", cookie);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
});
