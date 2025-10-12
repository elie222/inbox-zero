"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { processPreviousSentEmails } from "@/utils/reply-tracker/check-previous-emails";
import {
  startAnalyzingReplyTracker,
  stopAnalyzingReplyTracker,
} from "@/utils/redis/reply-tracker-analyzing";
import { enableReplyTracker } from "@/utils/reply-tracker/enable";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getEmailAccountWithAi } from "@/utils/user/get";

export const enableReplyTrackerAction = actionClient
  .metadata({ name: "enableReplyTracker" })
  .action(async ({ ctx: { emailAccountId, provider } }) => {
    await enableReplyTracker({ emailAccountId, provider });

    revalidatePath(prefixPath(emailAccountId, "/reply-zero"));

    return { success: true };
  });

export const processPreviousSentEmailsAction = actionClient
  .metadata({ name: "processPreviousSentEmails" })
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    // Not enabled for non-google providers yet
    if (!isGoogleProvider(provider)) return;

    const emailAccountWithAi = await getEmailAccountWithAi({ emailAccountId });

    if (!emailAccountWithAi) {
      logger.error("Email account not found");
      throw new SafeError("Email account not found");
    }

    await processPreviousSentEmails({
      emailAccount: emailAccountWithAi,
    });
  });

const resolveThreadTrackerSchema = z.object({
  threadId: z.string(),
  resolved: z.boolean(),
});

export const resolveThreadTrackerAction = actionClient
  .metadata({ name: "resolveThreadTracker" })
  .schema(resolveThreadTrackerSchema)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { threadId, resolved },
    }) => {
      await startAnalyzingReplyTracker({ emailAccountId }).catch((error) => {
        logger.error("Error starting Reply Zero analysis", { error });
      });

      await prisma.threadTracker.updateMany({
        where: {
          threadId,
          emailAccountId,
        },
        data: { resolved },
      });

      await stopAnalyzingReplyTracker({ emailAccountId }).catch((error) => {
        logger.error("Error stopping Reply Zero analysis", { error });
      });

      revalidatePath(prefixPath(emailAccountId, "/reply-zero"));

      return { success: true };
    },
  );
