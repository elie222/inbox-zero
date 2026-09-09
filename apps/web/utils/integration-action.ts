import { env } from "@/env";

export const INTEGRATION_ACTION_FEATURE_FLAG = "integration-actions";

export function isIntegrationActionGloballyEnabled() {
  return env.NEXT_PUBLIC_INTEGRATION_ACTION_ENABLED === true;
}
