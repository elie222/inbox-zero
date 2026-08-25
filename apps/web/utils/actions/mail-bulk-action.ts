"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  bulkArchiveThreadsActionSchema,
  bulkSenderActionSchema,
} from "@/utils/actions/mail-bulk-action.validation";
import { createEmailProvider } from "@/utils/email/provider";

export const bulkArchiveThreadsAction = actionClient
  .metadata({ name: "bulkArchiveThreads" })
  .inputSchema(bulkArchiveThreadsActionSchema)
  .action(
    async ({
      ctx: { emailAccountId, provider, emailAccount, logger },
      parsedInput: { threads },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      const result = await emailProvider.bulkArchiveThreads(
        threads,
        emailAccount.email,
      );

      const context = {
        failedThreadCount: result.failedThreadIds.length,
        succeededThreadCount: result.succeededThreadIds.length,
        threadCount: threads.length,
      };
      if (result.failedThreadIds.length) {
        logger.warn("Bulk thread archive completed with failures", context);
      } else {
        logger.info("Completed bulk thread archive", context);
      }

      return result;
    },
  );

export const bulkArchiveAction = actionClient
  .metadata({ name: "bulkArchive" })
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

      await emailProvider.bulkArchiveFromSenders(
        froms,
        emailAccount.email,
        emailAccountId,
      );
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
