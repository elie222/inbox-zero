import { NextResponse } from "next/server";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import {
  MOBILE_AUTH_PROVIDERS,
  startMobileSocialAuth,
} from "@/utils/mobile-auth/start-social";

const browserStartQuerySchema = z.object({
  provider: z.enum(MOBILE_AUTH_PROVIDERS),
});

export const GET = withError("mobile-auth/browser-start", async (request) => {
  const query = browserStartQuerySchema.parse({
    provider: request.nextUrl.searchParams.get("provider"),
  });
  const started = await startMobileSocialAuth({
    provider: query.provider,
    returnUrlMode: "desktop-scheme",
  });

  const response = NextResponse.redirect(started.authorizationURL, 302);
  for (const cookie of started.setCookies) {
    response.headers.append("set-cookie", cookie);
  }
  response.headers.set("Cache-Control", "no-store");
  return response;
});
