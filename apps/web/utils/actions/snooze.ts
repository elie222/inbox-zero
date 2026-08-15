"use server";

import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import { createEmailProvider } from "@/utils/email/provider";
import { snoozeThreads } from "@/utils/snooze/snooze";

const snoozeThreadsBody = z.object({
  threadIds: z.array(z.string().min(1)).min(1).max(100),
  snoozedUntil: z.coerce.date().refine((date) => date > new Date(), {
    message: "Snooze time must be in the future",
  }),
});

export const snoozeThreadsAction = actionClient
  .metadata({ name: "snoozeThreads" })
  .inputSchema(snoozeThreadsBody)
  .action(
    async ({
      ctx: { emailAccount, emailAccountId, logger, provider },
      parsedInput: { snoozedUntil, threadIds },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      return snoozeThreads({
        emailAccountId,
        logger,
        ownerEmail: emailAccount.email,
        provider: emailProvider,
        snoozedUntil,
        threadIds,
      });
    },
  );
