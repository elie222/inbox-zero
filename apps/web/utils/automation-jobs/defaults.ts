import { AutomationJobType } from "@/generated/prisma/enums";

export const DEFAULT_AUTOMATION_JOB_CRON = "0 9,15 * * 1-5";

export const AUTOMATION_CRON_PRESETS = [
  {
    cronExpression: DEFAULT_AUTOMATION_JOB_CRON,
    label: "Twice daily (weekdays)",
  },
  {
    cronExpression: "0 9 * * *",
    label: "Daily (morning)",
  },
  {
    cronExpression: "0 */3 * * *",
    label: "Every 3 hours",
  },
] as const;

export function getDefaultAutomationJobName(jobType: AutomationJobType) {
  if (jobType === AutomationJobType.INBOX_SUMMARY) return "Inbox summary";
  return "Inbox check-in";
}
