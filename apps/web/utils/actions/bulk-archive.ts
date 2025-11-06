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
    async ({ ctx: { emailAccountId, provider }, parsedInput: { froms } }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      for (const from of froms) {
        let nextPageToken: string | undefined;
        do {
          const result = await emailProvider.getMessagesFromSender({
            senderEmail: from,
            maxResults: 500,
            pageToken: nextPageToken,
          });

          await emailProvider.archiveMessagesBulk(
            result.messages.map((m) => m.id),
          );

          nextPageToken = result.nextPageToken;
        } while (nextPageToken);
      }
    },
  );
