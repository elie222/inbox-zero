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

const logger = createScopedLogger("enableReplyTracker");

export const enableReplyTrackerAction = actionClient
  .metadata({ name: "enableReplyTracker" })
  .action(async ({ ctx: { email } }) => {
    await enableReplyTracker({ email });

    revalidatePath("/reply-zero");

    return { success: true };
  });

export const processPreviousSentEmailsAction = actionClient
  .metadata({ name: "processPreviousSentEmails" })
  .action(async ({ ctx: { email, emailAccount } }) => {
    if (!emailAccount) throw new SafeError("Email account not found");

    const gmail = await getGmailClientForEmail({ email });
    await processPreviousSentEmails(gmail, emailAccount);

    return { success: true };
  });

const resolveThreadTrackerSchema = z.object({
  threadId: z.string(),
  resolved: z.boolean(),
});

export const resolveThreadTrackerAction = actionClient
  .metadata({ name: "resolveThreadTracker" })
  .schema(resolveThreadTrackerSchema)
  .action(async ({ ctx: { email }, parsedInput: { threadId, resolved } }) => {
    await startAnalyzingReplyTracker({ email }).catch((error) => {
      logger.error("Error starting Reply Zero analysis", { error });
    });

    await prisma.threadTracker.updateMany({
      where: {
        threadId,
        emailAccountId: email,
      },
      data: { resolved },
    });

    await stopAnalyzingReplyTracker({ email }).catch((error) => {
      logger.error("Error stopping Reply Zero analysis", { error });
    });

    revalidatePath("/reply-zero");

    return { success: true };
  });
