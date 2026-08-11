import { env } from "@/env";

export const TODOIST_INTEGRATION = "todoist";
export const TODOIST_ADD_TASKS_TOOL = "add-tasks";

export const TODOIST_INBOX_PROJECT_ID = "inbox";
export const TODOIST_INBOX_PROJECT_NAME = "Inbox";

export const TODOIST_DEFAULT_TASK_TEMPLATE =
  "{{Short action item based on the email}}";
export const TODOIST_DEFAULT_DESCRIPTION_TEMPLATE = "{{One-line context}}";
export const TODOIST_AI_DUE_STRING_TEMPLATE =
  "{{natural language due date mentioned in the email; omit if none}}";

export const INTEGRATION_ACTION_DISABLED_MESSAGE =
  "Integration actions are disabled. Set NEXT_PUBLIC_INTEGRATION_ACTION_ENABLED=true to enable.";

export function isIntegrationActionEnabled() {
  return env.NEXT_PUBLIC_INTEGRATION_ACTION_ENABLED === true;
}
