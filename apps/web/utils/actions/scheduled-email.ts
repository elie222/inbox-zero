"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { scheduleEmailBody } from "@/utils/actions/scheduled-email.validation";
import {
  scheduleEmail,
  processScheduledEmail,
} from "@/utils/scheduled-email/service";

export const scheduleEmailAction = actionClient
  .metadata({ name: "scheduleEmail" })
  .inputSchema(scheduleEmailBody)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const row = await scheduleEmail(emailAccountId, parsedInput);
    if (!parsedInput.sendAt) await processScheduledEmail(row.id, logger);
    return { id: row.id };
  });
