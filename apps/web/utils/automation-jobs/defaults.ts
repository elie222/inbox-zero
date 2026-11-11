import { msg } from "@lingui/core/macro";

export const DEFAULT_AUTOMATION_JOB_CRON = "0 9,14 * * 1-5";

export const AUTOMATION_CRON_PRESETS = [
  {
    id: "TWICE_DAILY",
    label: msg`Twice daily`,
    cronExpression: DEFAULT_AUTOMATION_JOB_CRON,
  },
  {
    id: "MORNING",
    label: msg`Morning`,
    cronExpression: "0 9 * * 1-5",
  },
  {
    id: "EVENING",
    label: msg`Evening`,
    cronExpression: "0 17 * * 1-5",
  },
] as const;

export function getDefaultAutomationJobName() {
  return "Scheduled check-ins";
}
