"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  scheduleEmailBody,
  scheduledEmailIdBody,
} from "@/utils/actions/scheduled-email.validation";
import {
  scheduleEmail,
  cancelScheduledEmail,
  retryScheduledEmail,
  processScheduledEmail,
} from "@/utils/scheduled-email/service";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

export const scheduleEmailAction = actionClient
  .metadata({ name: "scheduleEmail" })
  .inputSchema(scheduleEmailBody)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const row = await scheduleEmail(emailAccountId, parsedInput);
    if (!parsedInput.sendAt) await processScheduledEmail(row.id, logger);
    return { id: row.id };
  });

export const cancelScheduledEmailAction = actionClient
  .metadata({ name: "cancelScheduledEmail" })
  .inputSchema(scheduledEmailIdBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await cancelScheduledEmail(emailAccountId, id);
  });

export const retryScheduledEmailAction = actionClient
  .metadata({ name: "retryScheduledEmail" })
  .inputSchema(scheduledEmailIdBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await retryScheduledEmail(emailAccountId, id);
  });

export const cancelEmailReminderAction = actionClient
  .metadata({ name: "cancelEmailReminder" })
  .inputSchema(scheduledEmailIdBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    const result = await prisma.scheduledEmail.updateMany({
      where: { id, emailAccountId, reminderStatus: "PENDING" },
      data: { reminderStatus: "CANCELLED" },
    });
    if (!result.count)
      throw new SafeError(
        "This reminder has already started or is no longer pending.",
      );
  });
