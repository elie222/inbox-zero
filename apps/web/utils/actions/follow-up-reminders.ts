"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { saveFollowUpSettingsBody } from "@/utils/actions/follow-up-reminders.validation";
import prisma from "@/utils/prisma";

export const updateFollowUpSettingsAction = actionClient
  .metadata({ name: "updateFollowUpSettings" })
  .inputSchema(saveFollowUpSettingsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: {
        followUpRemindersEnabled,
        followUpAwaitingReplyDays,
        followUpNeedsReplyDays,
        followUpAutoDraftEnabled,
      },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          followUpRemindersEnabled,
          followUpAwaitingReplyDays,
          followUpNeedsReplyDays,
          followUpAutoDraftEnabled,
        },
      });

      return { success: true };
    },
  );
