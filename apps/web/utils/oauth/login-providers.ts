import { env } from "@/env";
import {
  hasAppleOauthConfig,
  hasGoogleOauthConfig,
  hasMicrosoftOauthConfig,
} from "@/utils/oauth/provider-config";

export type LoginProvider = "google" | "microsoft" | "apple" | "sso";

export function getEnabledLoginProviders(
  inputs: {
    hasGoogleConfig?: boolean;
    hasMicrosoftConfig?: boolean;
    hasAppleConfig?: boolean;
    ssoLoginEnabled?: boolean;
  } = {},
): ReadonlySet<LoginProvider> {
  const {
    hasGoogleConfig = hasGoogleOauthConfig(),
    hasMicrosoftConfig = hasMicrosoftOauthConfig(),
    hasAppleConfig = hasAppleOauthConfig(),
    ssoLoginEnabled = env.SSO_LOGIN_ENABLED,
  } = inputs;

  const enabled = new Set<LoginProvider>();

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
