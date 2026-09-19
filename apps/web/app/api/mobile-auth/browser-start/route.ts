import { NextResponse } from "next/server";
import { z } from "zod";
import { mobileAuthCodeChallengeSchema } from "@/utils/mobile-auth/pkce";
import { withError } from "@/utils/middleware";
import { startMobileSocialAuth } from "@/utils/mobile-auth/start-social";
import { mobileAuthProviderSchema } from "@/utils/mobile-auth/providers";

const browserStartQuerySchema = z.object({
  provider: mobileAuthProviderSchema,
  codeChallenge: mobileAuthCodeChallengeSchema,
});

export const GET = withError("mobile-auth/browser-start", async (request) => {
  const query = browserStartQuerySchema.parse({
    provider: request.nextUrl.searchParams.get("provider"),
    codeChallenge: request.nextUrl.searchParams.get("codeChallenge"),
  });
  const started = await startMobileSocialAuth({
    provider: query.provider,
    codeChallenge: query.codeChallenge,
    returnUrlMode: "desktop-scheme",
  });

  const response = NextResponse.redirect(started.authorizationURL, 302);
  for (const cookie of started.setCookies) {
    response.headers.append("set-cookie", cookie);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
});
