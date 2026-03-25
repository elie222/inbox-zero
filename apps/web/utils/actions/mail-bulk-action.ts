"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { bulkSenderActionSchema } from "@/utils/actions/mail-bulk-action.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { enqueueBulkArchiveSenderJobs } from "@/utils/email/bulk-archive-queue";

export const bulkArchiveAction = actionClient
  .metadata({ name: "bulkArchive" })
  .inputSchema(bulkSenderActionSchema)
  .action(
    async ({
      ctx: { emailAccountId, provider, emailAccount, logger },
      parsedInput: { froms },
    }) => {
      if (isGoogleProvider(provider)) {
        const queuedSenders = await enqueueBulkArchiveSenderJobs({
          emailAccountId,
          ownerEmail: emailAccount.email,
          froms,
          logger,
        });

        return {
          mode: "queued" as const,
          queuedSenders,
        };
      }

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      await emailProvider.bulkArchiveFromSenders(
        froms,
        emailAccount.email,
        emailAccountId,
      );

      return {
        mode: "completed" as const,
        processedSenders: froms.length,
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
