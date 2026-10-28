import { env } from "@/env";

const MICROSOFT_LOGIN_BASE_URL = "https://login.microsoftonline.com";
const MICROSOFT_GRAPH_DEFAULT_SCOPE = "https://graph.microsoft.com/.default";
const DEFAULT_ADMIN_CONSENT_TENANT = "organizations";

export const MICROSOFT_ADMIN_CONSENT_STATE_COOKIE_NAME =
  "microsoft_admin_consent_state";
export const MICROSOFT_ADMIN_CONSENT_CALLBACK_PATH =
  "/api/outlook/admin-consent/callback";
export const MICROSOFT_ADMIN_CONSENT_PAGE_PATH =
  "/login/microsoft-admin-consent";

export type MicrosoftAdminConsentState = {
  type: "microsoft-admin-consent";
};

export function getMicrosoftAdminConsentUrl(state: string) {
  const clientId = env.MICROSOFT_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("Microsoft login not enabled - missing client ID");
  }

  const url = new URL(
    `${MICROSOFT_LOGIN_BASE_URL}/${getMicrosoftAdminConsentTenant()}/v2.0/adminconsent`,
  );
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("scope", MICROSOFT_GRAPH_DEFAULT_SCOPE);
  url.searchParams.set("redirect_uri", getMicrosoftAdminConsentRedirectUri());
  url.searchParams.set("state", state);

  return url.toString();
}

export function getMicrosoftAdminConsentTenant() {
  const tenantId = env.MICROSOFT_TENANT_ID?.trim();
  if (tenantId && tenantId.toLowerCase() !== "common") {
    return encodeURIComponent(tenantId);
  }

  return DEFAULT_ADMIN_CONSENT_TENANT;
}

export function getMicrosoftAdminConsentRedirectUri() {
  return new URL(
    MICROSOFT_ADMIN_CONSENT_CALLBACK_PATH,
    env.NEXT_PUBLIC_BASE_URL,
  ).toString();
}
