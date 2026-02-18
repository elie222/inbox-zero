import { AutomationJobType } from "@/generated/prisma/enums";

export const DEFAULT_AUTOMATION_JOB_CRON = "0 9,14 * * 1-5";

export const AUTOMATION_CRON_PRESETS = [
  {
    id: "TWICE_DAILY",
    label: "Twice daily",
    cronExpression: DEFAULT_AUTOMATION_JOB_CRON,
  },
  {
    id: "MORNING",
    label: "Morning",
    cronExpression: "0 9 * * 1-5",
  },
  {
    id: "EVENING",
    label: "Evening",
    cronExpression: "0 17 * * 1-5",
  },
] as const;

export function getDefaultAutomationJobName(jobType: AutomationJobType) {
  if (jobType === AutomationJobType.INBOX_SUMMARY) return "Inbox summary";
  return "Scheduled check-ins";
}
