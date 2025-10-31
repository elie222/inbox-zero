"use server";

import { after } from "next/server";
import {
  cleanInboxSchema,
  undoCleanInboxSchema,
  changeKeepToDoneSchema,
} from "@/utils/actions/clean.validation";
import { bulkEnqueueJobs } from "@/utils/queue/queue-manager";
import { env } from "@/env";
import {
  getLabel,
  getOrCreateInboxZeroLabel,
  GmailLabel,
  labelThread,
} from "@/utils/gmail/label";
import type { CleanThreadBody } from "@/app/api/clean/route";
import { isDefined } from "@/utils/types";
import { inboxZeroLabels } from "@/utils/label";
import prisma from "@/utils/prisma";
import { CleanAction } from "@prisma/client";
import { updateThread } from "@/utils/redis/clean";
import { getUnhandledCount } from "@/utils/assess";
import { getGmailClientForEmail } from "@/utils/account";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getUserPremium } from "@/utils/user/get";
import { isActivePremium } from "@/utils/premium";
import { ONE_DAY_MS } from "@/utils/date";

export const cleanInboxAction = actionClient
  .metadata({ name: "cleanInbox" })
  .schema(cleanInboxSchema)
  .action(
    async ({
      ctx: { emailAccountId, provider, userId, logger },
      parsedInput: { action, instructions, daysOld, skips, maxEmails },
    }) => {
      if (!isGoogleProvider(provider)) {
        throw new SafeError(
          "Clean inbox is only supported for Google accounts",
        );
      }

      const premium = await getUserPremium({ userId });
      if (!premium) throw new SafeError("User not premium");
      if (!isActivePremium(premium)) throw new SafeError("Premium not active");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      const [markedDoneLabel, processedLabel] = await Promise.all([
        emailProvider.getOrCreateInboxZeroLabel(
          action === CleanAction.ARCHIVE ? "archived" : "marked_read",
        ),
        emailProvider.getOrCreateInboxZeroLabel("processed"),
      ]);

      const markedDoneLabelId = markedDoneLabel?.id;
      if (!markedDoneLabelId)
        throw new SafeError("Failed to create archived label");

      const processedLabelId = processedLabel?.id;
      if (!processedLabelId)
        throw new SafeError("Failed to create processed label");

      // create a cleanup job
      const job = await prisma.cleanupJob.create({
        data: {
          emailAccountId,
          action,
          instructions,
          daysOld,
          skipReply: skips.reply,
          skipStarred: skips.starred,
          skipCalendar: skips.calendar,
          skipReceipt: skips.receipt,
          skipAttachment: skips.attachment,
          skipConversation: skips.conversation,
        },
      });

      // const getLabels = async (instructions?: string) => {
      //   if (!instructions) return [];
      //   let labels: { id: string; name: string }[] | undefined;
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
      //   }
      //   return labels;
      // };

      const process = async () => {
        const { type } = await getUnhandledCount(emailProvider);

        // const labels = await getLabels(data.instructions);

        let nextPageToken: string | undefined | null;

        let totalEmailsProcessed = 0;

        do {
          // fetch all emails from the user's inbox
          const { threads, nextPageToken: pageToken } =
            await emailProvider.getThreadsWithQuery({
              query: {
                ...(daysOld > 0 && {
                  before: new Date(Date.now() - daysOld * ONE_DAY_MS),
                }),
                labelIds:
                  type === "inbox"
                    ? [GmailLabel.INBOX]
                    : [GmailLabel.INBOX, GmailLabel.UNREAD],
                excludeLabelNames: [inboxZeroLabels.processed.name],
              },
              maxResults: Math.min(maxEmails || 100, 100),
            });

          logger.info("Fetched threads", {
            threadCount: threads.length,
            nextPageToken,
          });

          nextPageToken = pageToken;

          if (threads.length === 0) break;

          logger.info("Pushing to queue system", {
            threadCount: threads.length,
            nextPageToken,
            queueSystem: env.QUEUE_SYSTEM,
          });

          const jobs = threads
            .map((thread) => {
              if (!thread.id) return;
              return {
                data: {
                  emailAccountId,
                  threadId: thread.id,
                  markedDoneLabelId,
                  processedLabelId,
                  jobId: job.id,
                  action,
                  instructions,
                  skips,
                } satisfies CleanThreadBody,
                opts: {
                  // Add any job-specific options here
                },
              };
            })
            .filter(isDefined);

          await bulkEnqueueJobs("ai-clean", {
            jobs,
          });

          totalEmailsProcessed += jobs.length;
        } while (
          nextPageToken &&
          !isMaxEmailsReached(totalEmailsProcessed, maxEmails)
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

export const undoCleanInboxAction = actionClient
  .metadata({ name: "undoCleanInbox" })
  .schema(undoCleanInboxSchema)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { threadId, markedDone, action },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId });

      // nothing to do atm if wasn't marked done
      if (!markedDone) return { success: true };

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
          where: { emailAccountId, threadId },
          orderBy: { createdAt: "desc" },
        });

        if (thread) {
          await updateThread({
            emailAccountId,
            jobId: thread.jobId,
            threadId,
            update: {
              undone: true,
              archive: false, // Reset the archive status since we've undone it
            },
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

export const changeKeepToDoneAction = actionClient
  .metadata({ name: "changeKeepToDone" })
  .schema(changeKeepToDoneSchema)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { threadId, action },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId });

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
          where: { emailAccountId, threadId },
          orderBy: { createdAt: "desc" },
        });

        if (thread) {
          // await updateThread(userId, thread.jobId, threadId, {
          //   archive: action === CleanAction.ARCHIVE,
          //   status: "completed",
          //   undone: true,
          // });

          await updateThread({
            emailAccountId,
            jobId: thread.jobId,
            threadId,
            update: {
              archive: action === CleanAction.ARCHIVE,
              status: "completed",
              undone: true,
            },
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
