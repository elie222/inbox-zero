import { NextResponse } from "next/server";
import {
  MICROSOFT_ADMIN_CONSENT_STATE_COOKIE_NAME,
  getMicrosoftAdminConsentUrl,
  type MicrosoftAdminConsentState,
} from "@/utils/microsoft/admin-consent";
import { withError } from "@/utils/middleware";
import {
  generateSignedOAuthState,
  oauthStateCookieOptions,
} from "@/utils/oauth/state";

export const GET = withError("outlook/admin-consent", async () => {
  const state = generateSignedOAuthState<MicrosoftAdminConsentState>({
    type: "microsoft-admin-consent",
  });

  const response = NextResponse.redirect(getMicrosoftAdminConsentUrl(state));
  response.cookies.set(
    MICROSOFT_ADMIN_CONSENT_STATE_COOKIE_NAME,
    state,
    oauthStateCookieOptions,
  );

  return response;
});
