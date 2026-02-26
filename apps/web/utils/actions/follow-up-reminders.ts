"use server";

import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import {
  toggleFollowUpRemindersBody,
  saveFollowUpSettingsBody,
  DEFAULT_FOLLOW_UP_DAYS,
} from "@/utils/actions/follow-up-reminders.validation";
import prisma from "@/utils/prisma";
import { processAccountFollowUps } from "@/app/api/follow-up-reminders/process";
import { SafeError } from "@/utils/error";

export const toggleFollowUpRemindersAction = actionClient
  .metadata({ name: "toggleFollowUpReminders" })
  .inputSchema(toggleFollowUpRemindersBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enabled } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: {
        followUpAwaitingReplyDays: enabled ? DEFAULT_FOLLOW_UP_DAYS : null,
        followUpNeedsReplyDays: enabled ? DEFAULT_FOLLOW_UP_DAYS : null,
      },
    });
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
    },
  );

export const scanFollowUpRemindersAction = actionClient
  .metadata({ name: "scanFollowUpReminders" })
  .inputSchema(z.object({}))
  .action(async ({ ctx: { emailAccountId, logger } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        id: true,
        userId: true,
        email: true,
        about: true,
        multiRuleSelectionEnabled: true,
        timezone: true,
        calendarBookingLink: true,
        followUpAwaitingReplyDays: true,
        followUpNeedsReplyDays: true,
        followUpAutoDraftEnabled: true,
        user: {
          select: {
            aiProvider: true,
            aiModel: true,
            aiApiKey: true,
          },
        },
        account: { select: { provider: true } },
      },
    });

    if (!emailAccount) throw new SafeError("Email account not found");

    await processAccountFollowUps({ emailAccount, logger });
  });
