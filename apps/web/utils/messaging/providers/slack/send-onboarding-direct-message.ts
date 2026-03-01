import { sendConnectionOnboardingDirectMessage } from "./send";
import type { Logger } from "@/utils/logger";

export async function sendSlackOnboardingDirectMessageWithLogging({
  accessToken,
  userId,
  teamId,
  logger,
}: {
  accessToken: string;
  userId: string;
  teamId: string;
  logger: Logger;
}): Promise<void> {
  try {
    await sendConnectionOnboardingDirectMessage({
      accessToken,
      userId,
    });
  } catch (error) {
    logger.warn("Failed to send Slack onboarding direct message", {
      teamId,
      userId,
      error,
    });
  }
}
