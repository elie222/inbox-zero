import { env } from "@/env";
import {
  hasAppleOauthConfig,
  hasGoogleOauthConfig,
  hasMicrosoftOauthConfig,
} from "@/utils/oauth/provider-config";

export type LoginProvider =
  | "google"
  | "microsoft"
  | "apple"
  | "sso"
  | "authelia";

export function getEnabledLoginProviders(
  inputs: {
    hasGoogleConfig?: boolean;
    hasMicrosoftConfig?: boolean;
    hasAppleConfig?: boolean;
    ssoLoginEnabled?: boolean;
    autheliaLoginEnabled?: boolean;
  } = {},
): ReadonlySet<LoginProvider> {
  const {
    hasGoogleConfig = hasGoogleOauthConfig(),
    hasMicrosoftConfig = hasMicrosoftOauthConfig(),
    hasAppleConfig = hasAppleOauthConfig(),
    ssoLoginEnabled = env.SSO_LOGIN_ENABLED,
    autheliaLoginEnabled = !!(
      env.NEXT_PUBLIC_AUTHELIA_ENABLED &&
      env.AUTHELIA_CLIENT_ID &&
      env.AUTHELIA_CLIENT_SECRET &&
      env.AUTHELIA_ISSUER_URL
    ),
  } = inputs;

  const enabled = new Set<LoginProvider>();

  if (autheliaLoginEnabled) enabled.add("authelia");

  if (hasGoogleConfig) {
    enabled.add("google");
  }
  if (hasMicrosoftConfig) {
    enabled.add("microsoft");
  }
  if (hasAppleConfig) {
    enabled.add("apple");
  }
  if (ssoLoginEnabled) {
    enabled.add("sso");
  }

  return enabled;
}
