"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  moveThreadsToJunkBody,
  restoreThreadsToInboxBody,
} from "@/utils/actions/no-address-spam.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { mapWithConcurrency } from "@/utils/async";
import prisma from "@/utils/prisma";

const PROVIDER_CONCURRENCY = 5;

export const moveThreadsToJunkAction = actionClient
  .metadata({ name: "moveThreadsToJunk" })
  .inputSchema(moveThreadsToJunkBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadIds },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const outcomes = await mapWithConcurrency(
        threadIds,
        PROVIDER_CONCURRENCY,
        async (threadId) => {
          try {
            await emailProvider.markSpam(threadId);
            return { threadId, ok: true };
          } catch (error) {
            logger.warn("Failed to move thread to junk", { threadId, error });
            return { threadId, ok: false };
          }
        },
      );
      const succeededThreadIds = outcomes
        .filter((outcome) => outcome.ok)
        .map((outcome) => outcome.threadId);
      const failedThreadIds = outcomes
        .filter((outcome) => !outcome.ok)
        .map((outcome) => outcome.threadId);

      // Junked mail leaves the sender list; the stats only track what is still in the mailbox.
      if (succeededThreadIds.length) {
        await prisma.emailMessage.deleteMany({
          where: {
            emailAccountId,
            from: "",
            threadId: { in: succeededThreadIds },
          },
        });
      }

      logger.info("Moved no-address threads to junk", {
        succeededThreadCount: succeededThreadIds.length,
        failedThreadCount: failedThreadIds.length,
      });

      return { succeededThreadIds, failedThreadIds };
    },
  );

export const restoreThreadsToInboxAction = actionClient
  .metadata({ name: "restoreThreadsToInbox" })
  .inputSchema(restoreThreadsToInboxBody)
  .action(
    async ({
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadIds, from },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      const outcomes = await mapWithConcurrency(
        threadIds,
        PROVIDER_CONCURRENCY,
        async (threadId) => {
          try {
            if (from === "junk") await emailProvider.markNotSpam(threadId);
            else await emailProvider.unarchiveThread(threadId);
            return { threadId, ok: true };
          } catch (error) {
            logger.warn("Failed to move thread back to inbox", {
              threadId,
              from,
              error,
            });
            return { threadId, ok: false };
          }
        },
      );

      return {
        succeededThreadIds: outcomes
          .filter((outcome) => outcome.ok)
          .map((outcome) => outcome.threadId),
        failedThreadIds: outcomes
          .filter((outcome) => !outcome.ok)
          .map((outcome) => outcome.threadId),
      };
    },
  );
