"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { bulkSenderActionSchema } from "@/utils/actions/mail-bulk-action.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { enqueueBulkArchiveSenderJobs } from "@/utils/email/bulk-archive-queue";

export const bulkArchiveAction = actionClient
  .metadata({ name: "bulkArchive" })
  .inputSchema(bulkSenderActionSchema)
  .action(
    async ({
      ctx: { emailAccountId, provider, emailAccount, logger },
      parsedInput: { froms },
    }) => {
      const queuedSenders = await enqueueBulkArchiveSenderJobs({
        emailAccountId,
        ownerEmail: emailAccount.email,
        provider,
        froms,
        logger,
      });

      return {
        mode: "queued" as const,
        queuedSenders,
      };
    },
  );

export const bulkTrashAction = actionClient
  .metadata({ name: "bulkTrash" })
  .inputSchema(bulkSenderActionSchema)
  .action(
    async ({
      ctx: { emailAccountId, provider, emailAccount, logger },
      parsedInput: { froms },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      await emailProvider.bulkTrashFromSenders(
        froms,
        emailAccount.email,
        emailAccountId,
      );
    },
  );
