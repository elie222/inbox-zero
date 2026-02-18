import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import {
  AUTOMATION_JOB_TYPES,
  type AutomationJobTypeValue,
} from "@/utils/automation-jobs/defaults";

export async function getAutomationJobMessage({
  jobType,
  prompt,
  emailProvider,
  logger,
}: {
  jobType: AutomationJobTypeValue;
  prompt: string | null;
  emailProvider: EmailProvider;
  logger: Logger;
}) {
  const trimmedPrompt = prompt?.trim();
  if (trimmedPrompt) return trimmedPrompt;

  switch (jobType) {
    case AUTOMATION_JOB_TYPES.INBOX_SUMMARY:
      return "I can prepare a quick summary of what changed in your inbox. Want to review it now?";

    default:
      try {
        const stats = await emailProvider.getInboxStats();

        if (stats.unread === 0) {
          return "Your inbox looks clear right now. Want me to keep monitoring and ping again later?";
        }

        return `You currently have ${stats.unread} unread emails. Want to go through them now?`;
      } catch (error) {
        logger.warn("Failed to read inbox stats for automation message", {
          error,
        });

        return "I checked in on your inbox. Want to triage emails now?";
      }
  }
}
