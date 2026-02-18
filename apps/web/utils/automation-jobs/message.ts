import { AutomationJobType } from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import {
  aiGenerateAutomationCheckInMessage,
  type AutomationCheckInEmailAccount,
} from "@/utils/ai/automation-jobs/generate-check-in-message";

export async function getAutomationJobMessage({
  jobType,
  prompt,
  emailProvider,
  emailAccount,
  logger,
}: {
  jobType: AutomationJobType;
  prompt: string | null;
  emailProvider: EmailProvider;
  emailAccount: AutomationCheckInEmailAccount;
  logger: Logger;
}) {
  const trimmedPrompt = prompt?.trim();
  if (trimmedPrompt) {
    try {
      return await aiGenerateAutomationCheckInMessage({
        prompt: trimmedPrompt,
        emailProvider,
        emailAccount,
      });
    } catch (error) {
      logger.warn("Failed to generate automation message from prompt", {
        error,
      });
    }
  }

  switch (jobType) {
    case AutomationJobType.INBOX_SUMMARY:
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
