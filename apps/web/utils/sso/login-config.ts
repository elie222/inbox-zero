import { env } from "@/env";

export function hasSsoLoginButtonEnabled() {
  return env.NEXT_PUBLIC_SSO_LOGIN_BUTTON_ENABLED;
}
