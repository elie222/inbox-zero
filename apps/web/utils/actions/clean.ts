"use server";

import { after } from "next/server";
import {
  cleanInboxSchema,
  undoCleanInboxSchema,
  changeKeepToDoneSchema,
} from "@/utils/actions/clean.validation";
import { bulkPublishToQstash } from "@/utils/upstash";
import { env } from "@/env";
import { GmailLabel } from "@/utils/gmail/label";
import type { CleanThreadBody } from "@/app/api/clean/route";
import { isDefined } from "@/utils/types";
import { inboxZeroLabels } from "@/utils/label";
import prisma from "@/utils/prisma";
import { CleanAction } from "@prisma/client";
import { updateThread } from "@/utils/redis/clean";
import { getUnhandledCount } from "@/utils/assess";
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
      // Temporarily disabled for testing
      // const premium = await getUserPremium({ userId });
      // if (!premium) throw new SafeError("User not premium");
      // if (!isActivePremium(premium)) throw new SafeError("Premium not active");

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      // Create InboxZero labels/folders for tracking
      const [markedDoneLabel, processedLabel] = await Promise.all([
        emailProvider.getOrCreateInboxZeroLabel(
          action === CleanAction.ARCHIVE ? "archived" : "marked_read",
        ),
        emailProvider.getOrCreateInboxZeroLabel("processed"),
      ]);

      const markedDoneLabelId = markedDoneLabel?.id;
      if (!markedDoneLabelId)
        throw new SafeError("Failed to create marked done label/folder");

      const processedLabelId = processedLabel?.id;
      if (!processedLabelId)
        throw new SafeError("Failed to create processed label/folder");

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
          // Use provider-agnostic query parameters
          const { threads, nextPageToken: pageToken } =
            await emailProvider.getThreadsWithQuery({
              query: {
                ...(daysOld > 0 && {
                  before: new Date(Date.now() - daysOld * ONE_DAY_MS),
                }),
                // For Gmail: use INBOX label. For Outlook: use inbox folder
                labelId: isGoogleProvider(provider)
                  ? GmailLabel.INBOX
                  : "inbox",
                // Include unread messages if we're processing unread
                ...(type !== "inbox" && { isUnread: true }),
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

          const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/clean`;

          logger.info("Pushing to Qstash", {
            threadCount: threads.length,
            nextPageToken,
          });

          const items = threads
            .map((thread) => {
              if (!thread.id) return;
              return {
                url,
                body: {
                  emailAccountId,
                  threadId: thread.id,
                  markedDoneLabelId,
                  processedLabelId,
                  jobId: job.id,
                  action,
                  instructions,
                  skips,
                } satisfies CleanThreadBody,
                // give every user their own queue for ai processing. if we get too many parallel users we may need more
                // api keys or a global queue
                // problem with a global queue is that if there's a backlog users will have to wait for others to finish first
                flowControl: {
                  key: `ai-clean-${emailAccountId}`,
                  parallelism: 3,
                },
              };
            })
            .filter(isDefined);

          await bulkPublishToQstash({ items });

          totalEmailsProcessed += items.length;
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
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId, markedDone, action },
    }) => {
      // nothing to do atm if wasn't marked done
      if (!markedDone) return { success: true };

      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      // Get the user's email for provider operations
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { email: true },
      });

      if (!emailAccount) throw new SafeError("Email account not found");

      // Get the label to remove
      const markedDoneLabel = await emailProvider.getLabelByName(
        action === CleanAction.ARCHIVE
          ? inboxZeroLabels.archived.name
          : inboxZeroLabels.marked_read.name,
      );

      // Undo the action based on what was done
      if (action === CleanAction.ARCHIVE) {
        // Move thread back to inbox
        await emailProvider.moveThreadToFolder(
          threadId,
          emailAccount.email,
          "inbox",
        );
      } else if (action === CleanAction.MARK_READ) {
        // Mark thread as unread
        await emailProvider.markReadThread(threadId, false);
      }

      // Remove our tracking label
      if (markedDoneLabel?.id) {
        await emailProvider.removeThreadLabel(threadId, markedDoneLabel.id);
      }

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
      ctx: { emailAccountId, provider, logger },
      parsedInput: { threadId, action },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
      });

      // Get the user's email for provider operations
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { email: true },
      });

      if (!emailAccount) throw new SafeError("Email account not found");

      // Get the label to add (archived or marked_read)
      const actionLabel = await emailProvider.getOrCreateInboxZeroLabel(
        action === CleanAction.ARCHIVE ? "archived" : "marked_read",
      );

      // Apply the action based on what was chosen
      if (action === CleanAction.ARCHIVE) {
        // Archive the thread (with label)
        await emailProvider.archiveThreadWithLabel(
          threadId,
          emailAccount.email,
          actionLabel?.id,
        );
      } else if (action === CleanAction.MARK_READ) {
        // Mark thread as read
        await emailProvider.markReadThread(threadId, true);
        // Add the marked_read label
        if (actionLabel?.id) {
          await emailProvider.labelMessage({
            messageId: threadId,
            labelId: actionLabel.id,
          });
        }
      }

      // Update Redis to mark this thread with the new status
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
