"use server";

import { after } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import {
  cleanInboxSchema,
  type CleanInboxBody,
  undoCleanInboxSchema,
  type UndoCleanInboxBody,
  changeKeepToDoneSchema,
  type ChangeKeepToDoneBody,
} from "@/utils/actions/clean.validation";
import { getThreadsWithNextPageToken } from "@/utils/gmail/thread";
import { getGmailClient } from "@/utils/gmail/client";
import { bulkPublishToQstash } from "@/utils/upstash";
import { env } from "@/env";
import {
  getLabel,
  getOrCreateInboxZeroLabel,
  // getOrCreateLabels,
  GmailLabel,
  labelThread,
} from "@/utils/gmail/label";
import { createScopedLogger } from "@/utils/logger";
import type { CleanThreadBody } from "@/app/api/clean/route";
import { isDefined } from "@/utils/types";
import { inboxZeroLabels } from "@/utils/label";
import prisma from "@/utils/prisma";
// import { aiCleanSelectLabels } from "@/utils/ai/clean/ai-clean-select-labels";
// import { getAiUser } from "@/utils/user/get";
import { CleanAction } from "@prisma/client";
import { updateThread } from "@/utils/redis/clean";
import { getUnhandledCount } from "@/utils/assess";

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

    const [markedDoneLabel, processedLabel] = await Promise.all([
      getOrCreateInboxZeroLabel({
        key: data.action === CleanAction.ARCHIVE ? "archived" : "marked_read",
        gmail,
      }),
      getOrCreateInboxZeroLabel({
        key: "processed",
        gmail,
      }),
    ]);

    const markedDoneLabelId = markedDoneLabel?.id;
    if (!markedDoneLabelId) return { error: "Failed to create archived label" };

    const processedLabelId = processedLabel?.id;
    if (!processedLabelId) return { error: "Failed to create processed label" };

    // create a cleanup job
    const job = await prisma.cleanupJob.create({
      data: {
        userId,
        action: data.action,
        instructions: data.instructions,
        daysOld: data.daysOld,
        skipReply: data.skips.reply,
        skipStarred: data.skips.starred,
        skipCalendar: data.skips.calendar,
        skipReceipt: data.skips.receipt,
        skipAttachment: data.skips.attachment,
        skipConversation: data.skips.conversation,
      },
    });

    // const getLabels = async (instructions?: string) => {
    //   if (!instructions) return [];

    //   let labels: { id: string; name: string }[] | undefined;

    //   const user = await getAiUser({ id: userId });
    //   if (!user) throw new Error("User not found");

    //   const labelNames = await aiCleanSelectLabels({ user, instructions });

    //   if (labelNames) {
    //     const gmailLabels = await getOrCreateLabels({
    //       names: labelNames,
    //       gmail,
    //     });

    //     labels = gmailLabels
    //       .map((label) => ({
    //         id: label.id || "",
    //         name: label.name || "",
    //       }))
    //       .filter((label) => label.id && label.name);

    //     logger.info("Selected labels", {
    //       email: session?.user.email,
    //       labels,
    //     });
    //   }

    //   return labels;
    // };

    const process = async () => {
      const { type } = await getUnhandledCount(gmail);

      // const labels = await getLabels(data.instructions);

      let nextPageToken: string | undefined | null;

      let totalEmailsProcessed = 0;

      const query = `${data.daysOld ? `older_than:${data.daysOld}d ` : ""}-in:"${inboxZeroLabels.processed.name}"`;

      do {
        // fetch all emails from the user's inbox
        const { threads, nextPageToken: pageToken } =
          await getThreadsWithNextPageToken({
            gmail,
            q: query,
            labelIds:
              type === "inbox"
                ? [GmailLabel.INBOX]
                : [GmailLabel.INBOX, GmailLabel.UNREAD],
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
                markedDoneLabelId,
                processedLabelId,
                jobId: job.id,
                action: data.action,
                instructions: data.instructions,
                skips: data.skips,
                labels: [],
              } satisfies CleanThreadBody,
              // give every user their own queue for ai processing. if we get too many parallel users we may need more
              // api keys or a global queue
              // problem with a global queue is that if there's a backlog users will have to wait for others to finish first
              flowControl: {
                key: `ai-clean-${userId}`,
                parallelism: 3,
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

    after(() => process());

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

    const { threadId, markedDone, action } = data;

    // nothing to do atm if wasn't marked done
    if (!markedDone) return { success: true };

    const gmail = getGmailClient(session);

    // get the label to remove
    const markedDoneLabel = await getLabel({
      name:
        action === CleanAction.ARCHIVE
          ? inboxZeroLabels.archived.name
          : inboxZeroLabels.marked_read.name,
      gmail,
    });

    await labelThread({
      gmail,
      threadId,
      // undo core action
      addLabelIds:
        action === CleanAction.ARCHIVE
          ? [GmailLabel.INBOX]
          : [GmailLabel.UNREAD],
      // undo our own labelling
      removeLabelIds: markedDoneLabel?.id ? [markedDoneLabel.id] : undefined,
    });

    // Update Redis to mark this thread as undone
    try {
      // We need to get the thread first to get the jobId
      const thread = await prisma.cleanupThread.findFirst({
        where: { userId, threadId },
        orderBy: { createdAt: "desc" },
      });

      if (thread) {
        await updateThread(userId, thread.jobId, threadId, {
          undone: true,
          archive: false, // Reset the archive status since we've undone it
        });
      }
    } catch (error) {
      logger.error("Failed to update Redis for undone thread", {
        error,
        threadId,
      });
      // Continue even if Redis update fails
    }

    return { success: true };
  },
);

export const changeKeepToDoneAction = withActionInstrumentation(
  "changeKeepToDone",
  async (unsafeData: ChangeKeepToDoneBody) => {
    const session = await auth();
    const userId = session?.user.id;
    if (!userId) return { error: "Not logged in" };

    const { data, success, error } =
      changeKeepToDoneSchema.safeParse(unsafeData);
    if (!success) return { error: error.message };

    const { threadId, action } = data;

    const gmail = getGmailClient(session);

    // Get the label to add (archived or marked_read)
    const actionLabel = await getOrCreateInboxZeroLabel({
      key: action === CleanAction.ARCHIVE ? "archived" : "marked_read",
      gmail,
    });

    await labelThread({
      gmail,
      threadId,
      // Apply the action (archive or mark as read)
      removeLabelIds: [
        ...(action === CleanAction.ARCHIVE ? [GmailLabel.INBOX] : []),
        ...(action === CleanAction.MARK_READ ? [GmailLabel.UNREAD] : []),
      ],
      addLabelIds: [...(actionLabel?.id ? [actionLabel.id] : [])],
    });

    // Update Redis to mark this thread with the new status
    try {
      // We need to get the thread first to get the jobId
      const thread = await prisma.cleanupThread.findFirst({
        where: { userId, threadId },
        orderBy: { createdAt: "desc" },
      });

      if (thread) {
        await updateThread(userId, thread.jobId, threadId, {
          archive: action === CleanAction.ARCHIVE,
          status: "completed",
          undone: true,
        });
      }
    } catch (error) {
      logger.error("Failed to update Redis for changed thread:", {
        error,
        threadId,
      });
      // Continue even if Redis update fails
    }

    return { success: true };
  },
);
