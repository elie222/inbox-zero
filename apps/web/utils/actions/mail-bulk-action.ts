"use server";

import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import { createEmailProvider } from "@/utils/email/provider";

export const bulkArchiveAction = actionClient
  .metadata({ name: "bulkArchive" })
  .inputSchema(
    z.object({
      froms: z.array(z.string()),
    }),
  )
  .action(
    async ({
      ctx: { emailAccountId, provider, emailAccount },
      parsedInput: { froms },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      await emailProvider.bulkArchiveFromSenders(froms, emailAccount.email);
    },
  );

export const bulkTrashAction = actionClient
  .metadata({ name: "bulkTrash" })
  .inputSchema(
    z.object({
      froms: z.array(z.string()),
    }),
  )
  .action(
    async ({
      ctx: { emailAccountId, provider, emailAccount },
      parsedInput: { froms },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      await emailProvider.bulkTrashFromSenders(froms, emailAccount.email);
    },
  );
