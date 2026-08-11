import { env } from "@/env";

export const TODOIST_INTEGRATION = "todoist";
export const TODOIST_ADD_TASKS_TOOL = "add-tasks";

export const INTEGRATION_ACTION_DISABLED_MESSAGE =
  "Integration actions are disabled. Set NEXT_PUBLIC_INTEGRATION_ACTION_ENABLED=true to enable.";

export function isIntegrationActionEnabled() {
  return env.NEXT_PUBLIC_INTEGRATION_ACTION_ENABLED === true;
}
