"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { updateMeetingBriefsSettingsBody } from "@/utils/actions/meeting-briefs.validation";
import prisma from "@/utils/prisma";

export const updateMeetingBriefsSettingsAction = actionClient
  .metadata({ name: "updateMeetingBriefsSettings" })
  .inputSchema(updateMeetingBriefsSettingsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { enabled, minutesBefore },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          meetingBriefingsEnabled: enabled,
          meetingBriefingsMinutesBefore: minutesBefore,
        },
      });
    },
  );
