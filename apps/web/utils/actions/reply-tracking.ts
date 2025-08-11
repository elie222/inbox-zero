"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { processPreviousSentEmails } from "@/utils/reply-tracker/check-previous-emails";
import {
  startAnalyzingReplyTracker,
  stopAnalyzingReplyTracker,
} from "@/utils/redis/reply-tracker-analyzing";
import { enableReplyTracker } from "@/utils/reply-tracker/enable";
import { actionClient } from "@/utils/actions/safe-action";
import { getGmailClientForEmail } from "@/utils/account";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";

const logger = createScopedLogger("enableReplyTracker");

export const enableReplyTrackerAction = actionClient
  .metadata({ name: "enableReplyTracker" })
  .action(async ({ ctx: { emailAccountId } }) => {
    await enableReplyTracker({ emailAccountId });

    revalidatePath(prefixPath(emailAccountId, "/reply-zero"));

    return { success: true };
  });

export const processPreviousSentEmailsAction = actionClient
  .metadata({ name: "processPreviousSentEmails" })
  .action(async ({ ctx: { emailAccountId } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        account: { select: { provider: true } },
        user: { select: { aiProvider: true, aiModel: true, aiApiKey: true } },
        id: true,
        email: true,
        userId: true,
        about: true,
      },
    });

    if (emailAccount?.account?.provider !== "google") {
      return { success: true };
    }

    if (!emailAccount) throw new SafeError("Email account not found");

    const gmail = await getGmailClientForEmail({ emailAccountId });
    await processPreviousSentEmails({ gmail, emailAccount });

    return { success: true };
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
      ctx: { emailAccountId },
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
