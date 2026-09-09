"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { snoozeThreadsBody } from "@/utils/actions/snooze.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { snoozeThreads } from "@/utils/snooze/snooze";

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
