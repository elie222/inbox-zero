"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { updateMeetingSchedulerSettingsBody } from "@/utils/actions/meeting-scheduler.validation";
import prisma from "@/utils/prisma";
import { createManagedOutlookSubscription } from "@/utils/outlook/subscription-manager";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("meeting-scheduler-action");

export const updateMeetingSchedulerSettingsAction = actionClient
  .metadata({ name: "updateMeetingSchedulerSettings" })
  .schema(updateMeetingSchedulerSettingsBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    // Validate working hours
    if (
      parsedInput.meetingSchedulerWorkingHoursStart !== undefined &&
      parsedInput.meetingSchedulerWorkingHoursEnd !== undefined &&
      parsedInput.meetingSchedulerWorkingHoursStart >=
        parsedInput.meetingSchedulerWorkingHoursEnd
    ) {
      throw new Error("Working hours start must be before end");
    }

    // Get current state before update
    const currentAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        meetingSchedulerEnabled: true,
        account: { select: { provider: true } },
      },
    });

    const updated = await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: parsedInput,
      select: {
        meetingSchedulerEnabled: true,
        meetingSchedulerDefaultDuration: true,
        meetingSchedulerPreferredProvider: true,
        meetingSchedulerWorkingHoursStart: true,
        meetingSchedulerWorkingHoursEnd: true,
        meetingSchedulerAutoCreate: true,
      },
    });

    // Auto-setup webhooks when enabling Meeting Scheduler for Outlook
    if (
      parsedInput.meetingSchedulerEnabled &&
      !currentAccount?.meetingSchedulerEnabled &&
      currentAccount?.account?.provider === "microsoft"
    ) {
      logger.info("Auto-setting up Outlook webhook for Meeting Scheduler", {
        emailAccountId,
      });

      try {
        await createManagedOutlookSubscription(emailAccountId);
        logger.info("Successfully set up Outlook webhook", { emailAccountId });
      } catch (error) {
        logger.error("Failed to set up Outlook webhook", {
          emailAccountId,
          error,
        });
        // Don't fail the entire action if webhook setup fails
        // The cron job will retry later
      }
    }

    return updated;
  });

export const connectCalendarWebhookAction = actionClient
  .metadata({ name: "connectCalendarWebhook" })
  .action(async ({ ctx: { emailAccountId } }) => {
    logger.info("Manually connecting calendar webhook", { emailAccountId });

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        account: { select: { provider: true } },
        watchEmailsExpirationDate: true,
      },
    });

    if (emailAccount?.account?.provider !== "microsoft") {
      throw new Error(
        "Calendar webhook is only available for Microsoft accounts",
      );
    }

    try {
      const expirationDate =
        await createManagedOutlookSubscription(emailAccountId);
      logger.info("Successfully connected calendar webhook", {
        emailAccountId,
        expirationDate,
      });

      return {
        success: true,
        expirationDate,
      };
    } catch (error) {
      logger.error("Failed to connect calendar webhook", {
        emailAccountId,
        error,
      });
      throw new Error("Failed to connect calendar. Please try again.");
    }
  });
