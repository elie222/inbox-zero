"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  toggleFollowUpRemindersBody,
  saveFollowUpSettingsBody,
} from "@/utils/actions/follow-up-reminders.validation";
import prisma from "@/utils/prisma";

export const toggleFollowUpRemindersAction = actionClient
  .metadata({ name: "toggleFollowUpReminders" })
  .inputSchema(toggleFollowUpRemindersBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enabled } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { followUpRemindersEnabled: enabled },
    });

    return { success: true };
  });

export const updateFollowUpSettingsAction = actionClient
  .metadata({ name: "updateFollowUpSettings" })
  .inputSchema(saveFollowUpSettingsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: {
        followUpAwaitingReplyDays,
        followUpNeedsReplyDays,
        followUpAutoDraftEnabled,
      },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          followUpAwaitingReplyDays,
          followUpNeedsReplyDays,
          followUpAutoDraftEnabled,
        },
      });

      return { success: true };
    },
  );
