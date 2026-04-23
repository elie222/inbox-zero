import { env } from "@/env";

export function hasSsoLoginButtonEnabled() {
  return env.SSO_LOGIN_ENABLED;
}
