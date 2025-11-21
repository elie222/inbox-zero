"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import prisma from "@/utils/prisma";
import {
  startAnalyzingReplyTracker,
  stopAnalyzingReplyTracker,
} from "@/utils/redis/reply-tracker-analyzing";
import { actionClient } from "@/utils/actions/safe-action";
import { prefixPath } from "@/utils/path";

const resolveThreadTrackerSchema = z.object({
  threadId: z.string(),
  resolved: z.boolean(),
});

export const resolveThreadTrackerAction = actionClient
  .metadata({ name: "resolveThreadTracker" })
  .inputSchema(resolveThreadTrackerSchema)
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
