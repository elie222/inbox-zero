import { NextResponse } from "next/server";
import { z } from "zod";
import { mobileAuthCodeChallengeSchema } from "@/utils/mobile-auth/pkce";
import { withError } from "@/utils/middleware";
import { startMobileSocialAuth } from "@/utils/mobile-auth/start-social";
import { mobileAuthProviderSchema } from "@/utils/mobile-auth/providers";
import { MOBILE_AUTH_RETURN_URL_MODES } from "@/utils/mobile-auth/url";

const startMobileAuthSchema = z.object({
  provider: mobileAuthProviderSchema,
  codeChallenge: mobileAuthCodeChallengeSchema,
  returnUrlMode: z.enum(MOBILE_AUTH_RETURN_URL_MODES).optional(),
});

export type StartMobileAuthResponse = {
  authorizationURL: string;
  authSessionReturnUrl: string;
  oauthState: string;
  state: string;
};

export const POST = withError("mobile-auth/start", async (request) => {
  const body = startMobileAuthSchema.parse(await request.json());
  const started = await startMobileSocialAuth({
    provider: body.provider,
    codeChallenge: body.codeChallenge,
    returnUrlMode: body.returnUrlMode ?? "app-link",
  });

  const response: StartMobileAuthResponse = {
    authorizationURL: started.authorizationURL,
    authSessionReturnUrl: started.authSessionReturnUrl,
    oauthState: started.oauthState,
    state: started.state,
  };

  return NextResponse.json(response, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
});
