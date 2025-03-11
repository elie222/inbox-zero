"use server";

import { waitUntil } from "@vercel/functions";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import {
  cleanInboxSchema,
  type CleanInboxBody,
  undoCleanInboxSchema,
  type UndoCleanInboxBody,
} from "@/utils/actions/clean.validation";
import { getThreadsWithNextPageToken } from "@/utils/gmail/thread";
import { getGmailClient } from "@/utils/gmail/client";
import { bulkPublishToQstash } from "@/utils/upstash";
import { env } from "@/env";
import {
  getOrCreateInboxZeroLabel,
  GmailLabel,
  labelThread,
} from "@/utils/gmail/label";
import { createScopedLogger } from "@/utils/logger";
import type { CleanThreadBody } from "@/app/api/clean/route";
import { isDefined } from "@/utils/types";
import { inboxZeroLabels } from "@/utils/label";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("actions/clean");

export const cleanInboxAction = withActionInstrumentation(
  "cleanInbox",
  async (unsafeData: CleanInboxBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } = cleanInboxSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    const gmail = getGmailClient(session);

    const [archiveLabel, processedLabel] = await Promise.all([
      getOrCreateInboxZeroLabel({
        key: "archived",
        gmail,
      }),
      getOrCreateInboxZeroLabel({
        key: "processed",
        gmail,
      }),
    ]);

    const archiveLabelId = archiveLabel?.id;
    if (!archiveLabelId) return { error: "Failed to create archived label" };

    const processedLabelId = processedLabel?.id;
    if (!processedLabelId) return { error: "Failed to create processed label" };

    // create a cleanup job
    const job = await prisma.cleanupJob.create({
      data: {
        userId,
        action: data.action,
        instructions: data.prompt,
        daysOld: data.daysOld,
      },
    });

    const process = async () => {
      let nextPageToken: string | undefined | null;

      let totalEmailsProcessed = 0;

      const query = `older_than:${data.daysOld}d -in:"${inboxZeroLabels.processed.name}" in:inbox`;

      do {
        // fetch all emails from the user's inbox
        const { threads, nextPageToken: pageToken } =
          await getThreadsWithNextPageToken({
            gmail,
            q: query,
            labelIds: [GmailLabel.INBOX],
            maxResults: Math.min(data.maxEmails || 100, 100),
          });

        logger.info("Fetched threads", {
          userId,
          threadCount: threads.length,
          nextPageToken,
        });

        nextPageToken = pageToken;

        if (threads.length === 0) break;

        const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/clean`;

        logger.info("Pushing to Qstash", {
          userId,
          threadCount: threads.length,
          nextPageToken,
        });

        const items = threads
          .map((thread) => {
            if (!thread.id) return;
            return {
              url,
              body: {
                userId,
                threadId: thread.id,
                archiveLabelId,
                processedLabelId,
                jobId: job.id,
              } satisfies CleanThreadBody,
              // give every user their own queue for ai processing. if we get too many parallel users we may need more
              // api keys or a global queue
              // problem with a global queue is that if there's a backlog users will have to wait for others to finish first
              flowControl: {
                key: `ai-clean-${userId}`,
                parallelism: 1,
              },
            };
          })
          .filter(isDefined);

        await bulkPublishToQstash({ items });

        totalEmailsProcessed += items.length;
      } while (
        nextPageToken &&
        !isMaxEmailsReached(totalEmailsProcessed, data.maxEmails)
      );
    };

    waitUntil(process());

    return { jobId: job.id };
  },
);

function isMaxEmailsReached(totalEmailsProcessed: number, maxEmails?: number) {
  if (!maxEmails) return false;
  return totalEmailsProcessed >= maxEmails;
}

export const undoCleanInboxAction = withActionInstrumentation(
  "undoCleanInbox",
  async (unsafeData: UndoCleanInboxBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } = undoCleanInboxSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    const { threadId, archived } = data;

    const gmail = getGmailClient(session);

    // if archived, put back in inbox
    if (archived) {
      await labelThread({
        gmail,
        threadId,
        addLabelIds: [GmailLabel.INBOX],
      });
    }

    return { success: true };
  },
);
