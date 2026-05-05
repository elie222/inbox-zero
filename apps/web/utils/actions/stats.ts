"use server";

import { actionClient } from "@/utils/actions/safe-action";
import { z } from "zod";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { loadEmails } from "@/utils/actions/stats-loading";

export const loadEmailStatsAction = actionClient
  .metadata({ name: "loadEmailStats" })
  .inputSchema(z.object({ loadBefore: z.boolean() }))
  .action(
    async ({
      parsedInput: { loadBefore },
      ctx: { emailAccountId, logger },
    }) => {
      // Get email account with provider information
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          account: {
            select: { provider: true },
          },
        },
      });

      if (!emailAccount?.account?.provider) {
        throw new SafeError("Email account or provider not found");
      }

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider: emailAccount.account.provider,
        logger,
      });

      await loadEmails(
        {
          emailAccountId,
          emailProvider,
          logger,
        },
        {
          loadBefore,
        },
      );
    },
  );
