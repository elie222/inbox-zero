import { NextResponse } from "next/server";
import {
  MICROSOFT_ADMIN_CONSENT_PAGE_PATH,
  MICROSOFT_ADMIN_CONSENT_STATE_COOKIE_NAME,
  type MicrosoftAdminConsentState,
} from "@/utils/microsoft/admin-consent";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { validateSignedOAuthState } from "@/utils/oauth/state";
import { buildRedirectUrl } from "@/utils/redirect";

export const GET = withError(
  "outlook/admin-consent/callback",
  async (request) => {
    const searchParams = request.nextUrl.searchParams;
    const stateValidation =
      validateSignedOAuthState<MicrosoftAdminConsentState>({
        receivedState: searchParams.get("state"),
        storedState: request.cookies.get(
          MICROSOFT_ADMIN_CONSENT_STATE_COOKIE_NAME,
        )?.value,
      });

    if (!stateValidation.success) {
      request.logger.warn("Invalid state during Microsoft admin consent");
      return createAdminConsentRedirect({
        error: "invalid_state",
      });
    }

    if (stateValidation.state.type !== "microsoft-admin-consent") {
      request.logger.warn("Unexpected Microsoft admin consent state type");
      return createAdminConsentRedirect({
        error: "invalid_state",
      });
    }

    const oauthError = searchParams.get("error");
    if (oauthError) {
      request.logger.warn("Microsoft admin consent returned an error", {
        oauthError,
      });
      return createAdminConsentRedirect({
        error: "oauth_error",
      });
    }

    if (searchParams.get("admin_consent")?.toLowerCase() !== "true") {
      request.logger.warn("Microsoft admin consent was not granted");
      return createAdminConsentRedirect({
        error: "not_granted",
      });
    }

    return createAdminConsentRedirect({ status: "success" });
  },
);

function createAdminConsentRedirect(
  query: { status: "success" } | { error: string },
) {
  const response = NextResponse.redirect(
    new URL(
      buildRedirectUrl(MICROSOFT_ADMIN_CONSENT_PAGE_PATH, query),
      env.NEXT_PUBLIC_BASE_URL,
    ),
  );
  response.cookies.delete(MICROSOFT_ADMIN_CONSENT_STATE_COOKIE_NAME);

  return response;
}
