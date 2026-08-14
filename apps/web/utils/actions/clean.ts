"use server";

import type { gmail_v1 } from "@googleapis/gmail";
import { after } from "next/server";
import {
  cleanInboxSchema,
  undoCleanInboxSchema,
  changeKeepToDoneSchema,
  removeLabelFromThreadSchema,
} from "@/utils/actions/clean.validation";
import { bulkPublishToQstash } from "@/utils/upstash";
import {
  getLabel,
  getLabels,
  getOrCreateInboxZeroLabel,
  GmailLabel,
  labelThread,
} from "@/utils/gmail/label";
import { normalizeLabelName } from "@/utils/label/normalize-label-name";
import type { CleanThreadBody } from "@/app/api/clean/controller";
import { MAX_CLEAN_LABELS } from "@/utils/clean/consts";
import { isDefined } from "@/utils/types";
import { FOLLOW_UP_LABEL, inboxZeroLabels } from "@/utils/label";
import prisma from "@/utils/prisma";
import { CleanAction, SystemType } from "@/generated/prisma/enums";
import { getRuleLabel } from "@/utils/rule/consts";
import { updateThread } from "@/utils/redis/clean";
import { getUnhandledCount } from "@/utils/assess";
import { getGmailClientForEmail } from "@/utils/email-account-client";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import type { EmailProvider } from "@/utils/email/types";
import { getUserPremium } from "@/utils/user/get";
import { isActivePremium } from "@/utils/premium";
import { ONE_DAY_MS } from "@/utils/date";

export const cleanInboxAction = actionClient
  .metadata({ name: "cleanInbox" })
  .inputSchema(cleanInboxSchema)
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
        logger,
      });

      const [markedDoneLabel, processedLabel, labels] = await Promise.all([
        emailProvider.getOrCreateInboxZeroLabel(
          action === CleanAction.ARCHIVE ? "archived" : "marked_read",
        ),
        emailProvider.getOrCreateInboxZeroLabel("processed"),
        getCleanLabels(emailProvider).catch((error) => {
          logger.warn("Failed to fetch labels for clean", { error });
          return [];
        }),
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

      const process = async () => {
        const { type } = await getUnhandledCount(emailProvider);

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

          logger.info("Pushing to Qstash", {
            threadCount: threads.length,
            nextPageToken,
          });

          const items = threads
            .map((thread) => {
              if (!thread.id) return;
              return {
                path: "/api/clean",
                body: {
                  emailAccountId,
                  threadId: thread.id,
                  markedDoneLabelId,
                  processedLabelId,
                  jobId: job.id,
                  action,
                  instructions,
                  skips,
                  labels,
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

// Resolve a stored label name to its current Gmail label ID. Exact name match
// first; normalized match as a fallback that rejects ambiguity so we never
// remove a different label that merely differs by case or punctuation.
async function getLabelIdByName({
  gmail,
  name,
}: {
  gmail: gmail_v1.Gmail;
  name: string;
}): Promise<string | undefined> {
  const labels = await getLabels(gmail);
  const exactMatch = labels?.find((label) => label.name === name);
  if (exactMatch?.id) return exactMatch.id;
  const normalized = normalizeLabelName(name);
  const normalizedMatches =
    labels?.filter(
      (label) => label.name && normalizeLabelName(label.name) === normalized,
    ) ?? [];
  return normalizedMatches.length === 1
    ? (normalizedMatches[0]?.id ?? undefined)
    : undefined;
}

const CLEAN_EXCLUDED_LABEL_NAMES = [
  ...Object.values(inboxZeroLabels).map((label) => label.name),
  FOLLOW_UP_LABEL,
  ...Object.values(SystemType).map((type) => getRuleLabel(type)),
];

async function getCleanLabels(emailProvider: EmailProvider) {
  const labels = await emailProvider.getLabels();

  return labels
    .filter((label) => !CLEAN_EXCLUDED_LABEL_NAMES.includes(label.name))
    .sort((a, b) => (b.threadsTotal ?? 0) - (a.threadsTotal ?? 0))
    .slice(0, MAX_CLEAN_LABELS)
    .map((label) => ({ id: label.id, name: label.name }));
}

export const undoCleanInboxAction = actionClient
  .metadata({ name: "undoCleanInbox" })
  .inputSchema(undoCleanInboxSchema)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { threadId, markedDone, action, jobId: inputJobId },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId, logger });

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

      // Resolve the AI-applied label (if any) so undo removes it too.
      // Best-effort: if the record or label lookup fails, the core undo still proceeds.
      let appliedLabelId: string | undefined;
      let jobId: string | undefined;
      try {
        // Scope to the run the UI is undoing from: the same thread can appear
        // in multiple cleanup runs, each with its own label.
        const thread = await prisma.cleanupThread.findFirst({
          where: {
            emailAccountId,
            threadId,
            ...(inputJobId ? { jobId: inputJobId } : {}),
          },
          orderBy: { createdAt: "desc" },
          select: {
            jobId: true,
            label: true,
            labelId: true,
            labelAdded: true,
          },
        });

        jobId = thread?.jobId;
        // Only remove the label when this run added it: the AI may have picked
        // a label that was already on the thread, and undo must not touch
        // labels the clean run didn't apply. Legacy rows default to added.
        const addedByRun = thread?.labelAdded ?? true;
        if (addedByRun && thread?.labelId) {
          appliedLabelId = thread.labelId;
        } else if (addedByRun && thread?.label) {
          appliedLabelId = await getLabelIdByName({
            gmail,
            name: thread.label,
          });
        }
      } catch (error) {
        logger.error("Failed to resolve AI-applied label for undo", {
          error,
          threadId,
        });
      }

      // Fall back to the job the run page knows about: the DB row may not exist
      // yet while Qstash is still applying the action.
      if (!jobId) jobId = inputJobId;

      await labelThread({
        gmail,
        threadId,
        // undo core action
        addLabelIds:
          action === CleanAction.ARCHIVE
            ? [GmailLabel.INBOX]
            : [GmailLabel.UNREAD],
        removeLabelIds: [markedDoneLabel?.id, appliedLabelId].filter(isDefined),
      });

      // Update Redis to mark this thread as undone
      if (jobId) {
        try {
          await updateThread({
            emailAccountId,
            jobId,
            threadId,
            update: {
              undone: true,
              archive: false, // Reset the archive status since we've undone it
              // Clear the AI-applied label so the UI matches Gmail
              ...(appliedLabelId ? { label: null } : {}),
            },
          });
        } catch (error) {
          logger.error("Failed to update Redis for undone thread", {
            error,
            threadId,
          });
          // Continue even if Redis update fails
        }
      }

      // Sync the DB record with Gmail: the applied label is gone
      try {
        if (appliedLabelId) {
          await prisma.cleanupThread.updateMany({
            where: {
              emailAccountId,
              threadId,
              ...(jobId ? { jobId } : {}),
            },
            data: { label: null, labelId: null, labelAdded: false },
          });
        }
      } catch (error) {
        logger.error("Failed to clear label from DB for undone thread", {
          error,
          threadId,
        });
      }

      return { success: true };
    },
  );

export const removeLabelFromThreadAction = actionClient
  .metadata({ name: "removeLabelFromThread" })
  .inputSchema(removeLabelFromThreadSchema)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { threadId, jobId: inputJobId },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId, logger });

      // Resolve the AI-applied label (if any). Unlike undo there is no core
      // action to fall back to, so failures surface as errors.
      let appliedLabelId: string | undefined;
      let jobId: string | undefined;
      try {
        // Scope to the run the UI is removing from: the same thread can appear
        // in multiple cleanup runs, each with its own label.
        const thread = await prisma.cleanupThread.findFirst({
          where: {
            emailAccountId,
            threadId,
            ...(inputJobId ? { jobId: inputJobId } : {}),
          },
          orderBy: { createdAt: "desc" },
          select: { jobId: true, label: true, labelId: true },
        });

        jobId = thread?.jobId ?? inputJobId;

        if (!thread?.label && !thread?.labelId) {
          if (!inputJobId) {
            logger.info("No AI-applied label found to remove", { threadId });
          }
          return { success: true };
        }

        if (thread.labelId) {
          appliedLabelId = thread.labelId;
        } else if (thread.label) {
          appliedLabelId = await getLabelIdByName({
            gmail,
            name: thread.label,
          });
        }
      } catch (error) {
        logger.error("Failed to resolve AI-applied label for removal", {
          error,
          threadId,
        });
        throw new SafeError("Failed to remove label");
      }

      if (appliedLabelId) {
        await labelThread({
          gmail,
          threadId,
          removeLabelIds: [appliedLabelId],
        });
      } else {
        logger.info(
          "AI-applied label no longer exists in Gmail; clearing local state",
          { threadId },
        );
      }

      // Clear Redis and DB even when the label is already gone from Gmail so
      // the UI doesn't keep showing a label that no longer exists.
      if (jobId) {
        try {
          await updateThread({
            emailAccountId,
            jobId,
            threadId,
            update: { label: null },
          });
        } catch (error) {
          logger.error("Failed to update Redis for removed label", {
            error,
            threadId,
          });
          // Continue even if Redis update fails
        }
      }

      // Sync the DB record with Gmail: the label is gone
      try {
        await prisma.cleanupThread.updateMany({
          where: {
            emailAccountId,
            threadId,
            ...(jobId ? { jobId } : {}),
          },
          data: { label: null, labelId: null, labelAdded: false },
        });
      } catch (error) {
        logger.error("Failed to clear label from DB", { error, threadId });
      }

      return { success: true };
    },
  );

export const changeKeepToDoneAction = actionClient
  .metadata({ name: "changeKeepToDone" })
  .inputSchema(changeKeepToDoneSchema)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { threadId, action },
    }) => {
      const gmail = await getGmailClientForEmail({ emailAccountId, logger });

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
