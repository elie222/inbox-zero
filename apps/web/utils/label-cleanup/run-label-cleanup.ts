import { LabelCleanupAction } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

// Bound a single run so one huge label can't starve the rest; the next run
// picks up where this one left off since it always looks at the oldest mail.
const MAX_MESSAGES_PER_RUN = 1000;
const PAGE_SIZE = 100;

export async function runLabelCleanups({ logger }: { logger: Logger }) {
  const cleanups = await prisma.labelCleanup.findMany({
    select: {
      id: true,
      labelId: true,
      labelName: true,
      afterDays: true,
      action: true,
      emailAccount: {
        select: {
          id: true,
          email: true,
          account: { select: { provider: true } },
        },
      },
    },
  });

  logger.info("Running label cleanups", { count: cleanups.length });

  const results: { id: string; processed: number; error?: string }[] = [];

  for (const cleanup of cleanups) {
    const log = logger.with({
      emailAccountId: cleanup.emailAccount.id,
      labelId: cleanup.labelId,
      action: cleanup.action,
    });

    try {
      const provider = await createEmailProvider({
        emailAccountId: cleanup.emailAccount.id,
        provider: cleanup.emailAccount.account.provider,
        logger: log,
      });

      const processed = await cleanupLabel({
        provider,
        ownerEmail: cleanup.emailAccount.email,
        labelId: cleanup.labelId,
        afterDays: cleanup.afterDays,
        action: cleanup.action,
        logger: log,
      });

      await prisma.labelCleanup.update({
        where: { id: cleanup.id },
        data: { lastRunAt: new Date(), lastRunCount: processed },
      });

      results.push({ id: cleanup.id, processed });
    } catch (error) {
      log.error("Label cleanup failed", { error });
      captureException(error, {
        extra: {
          cleanupId: cleanup.id,
          emailAccountId: cleanup.emailAccount.id,
        },
      });
      results.push({
        id: cleanup.id,
        processed: 0,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Takes the label off (or trashes) every thread under it whose mail is older
 * than the cutoff. Returns how many threads were touched.
 */
export async function cleanupLabel({
  provider,
  ownerEmail,
  labelId,
  afterDays,
  action,
  logger,
}: {
  provider: EmailProvider;
  ownerEmail: string;
  labelId: string;
  afterDays: number;
  action: LabelCleanupAction;
  logger: Logger;
}): Promise<number> {
  if (!provider.listMessageIds) {
    logger.info("Provider cannot list by label, skipping cleanup");
    return 0;
  }

  const threadIds = new Set<string>();
  let pageToken: string | undefined;
  let scanned = 0;

  do {
    const page = await provider.listMessageIds({
      labelIds: [labelId],
      query: `older_than:${afterDays}d`,
      maxResults: PAGE_SIZE,
      pageToken,
    });
    for (const message of page.messages) threadIds.add(message.threadId);
    scanned += page.messages.length;
    pageToken = page.nextPageToken;
  } while (pageToken && scanned < MAX_MESSAGES_PER_RUN);

  let processed = 0;
  for (const threadId of threadIds) {
    try {
      if (action === LabelCleanupAction.TRASH) {
        await provider.trashThread(threadId, ownerEmail, "automation");
      } else {
        await provider.removeThreadLabel(threadId, labelId);
      }
      processed++;
    } catch (error) {
      logger.warn("Could not clean up thread", { threadId, error });
    }
  }

  logger.info("Label cleanup done", {
    scanned,
    threads: threadIds.size,
    processed,
    hasMore: !!pageToken,
  });

  return processed;
}
