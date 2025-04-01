"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { getGmailClient } from "@/utils/gmail/client";
import { processPreviousSentEmails } from "@/utils/reply-tracker/check-previous-emails";
import {
  startAnalyzingReplyTracker,
  stopAnalyzingReplyTracker,
} from "@/utils/redis/reply-tracker-analyzing";
import { enableReplyTracker } from "@/utils/reply-tracker/enable";
import { getAiUser } from "@/utils/user/get";

const logger = createScopedLogger("enableReplyTracker");

export const enableReplyTrackerAction = withActionInstrumentation(
  "enableReplyTracker",
  async () => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    await enableReplyTracker(userId);

    revalidatePath("/reply-zero");

    return { success: true };
  },
);

export const processPreviousSentEmailsAction = withActionInstrumentation(
  "processPreviousSentEmails",
  async () => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const user = await getAiUser({ id: userId });
    if (!user) return { error: "User not found" };

    const gmail = getGmailClient({ accessToken: session.accessToken });
    await processPreviousSentEmails(gmail, user);

    return { success: true };
  },
);

const resolveThreadTrackerSchema = z.object({
  threadId: z.string(),
  resolved: z.boolean(),
});

type ResolveThreadTrackerBody = z.infer<typeof resolveThreadTrackerSchema>;

export const resolveThreadTrackerAction = withActionInstrumentation(
  "resolveThreadTracker",
  async (unsafeData: ResolveThreadTrackerBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } =
      resolveThreadTrackerSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    await startAnalyzingReplyTracker(userId).catch((error) => {
      logger.error("Error starting Reply Zero analysis", { error });
    });

    await prisma.threadTracker.updateMany({
      where: {
        threadId: data.threadId,
        userId,
      },
      data: { resolved: data.resolved },
    });

    await stopAnalyzingReplyTracker(userId).catch((error) => {
      logger.error("Error stopping Reply Zero analysis", { error });
    });

    revalidatePath("/reply-zero");

    return { success: true };
  },
);
