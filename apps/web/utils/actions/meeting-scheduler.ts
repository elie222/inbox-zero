"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { updateMeetingSchedulerSettingsBody } from "@/utils/actions/meeting-scheduler.validation";
import prisma from "@/utils/prisma";

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

    return updated;
  });
