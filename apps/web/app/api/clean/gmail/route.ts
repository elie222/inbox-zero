import { NextResponse } from "next/server";
import { z } from "zod";
import { withError, type RequestWithLogger } from "@/utils/middleware";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { GmailLabel, labelThread } from "@/utils/gmail/label";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { isDefined } from "@/utils/types";
import type { Logger } from "@/utils/logger";
import { CleanAction } from "@/generated/prisma/enums";
import { getThread, updateThread } from "@/utils/redis/clean";
import { withQstashOrInternal } from "@/utils/qstash";
import { assertCleanerApiEnabled } from "@/utils/cleaner-feature";

const cleanGmailSchema = z.object({
  emailAccountId: z.string(),
  threadId: z.string(),
  markDone: z.boolean(),
  action: z.enum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  labelId: z.string().optional(),
  labelName: z.string().optional(),
  labelAdded: z.boolean().optional(),
  markedDoneLabelId: z.string().optional(),
  processedLabelId: z.string().optional(),
  jobId: z.string(),
});
export type CleanGmailBody = z.infer<typeof cleanGmailSchema>;

async function performGmailAction({
  emailAccountId,
  threadId,
  markDone,
  labelId,
  labelName,
  labelAdded,
  markedDoneLabelId,
  processedLabelId,
  jobId,
  action,
  logger,
}: CleanGmailBody & { logger: Logger }) {
  const account = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
    },
  });

  if (!account) throw new SafeError("User not found", 404);
  if (!account.account?.access_token || !account.account?.refresh_token)
    throw new SafeError("No Gmail account found", 404);

  const gmail = await getGmailClientWithRefresh({
    accessToken: account.account.access_token,
    refreshToken: account.account.refresh_token,
    expiresAt: account.account.expires_at?.getTime() || null,
    emailAccountId,
    logger,
  });

  // If the user undid this thread while the job was in flight, applying the
  // action again would re-archive it and re-persist the label after the undo.
  const thread = await getThread({ emailAccountId, jobId, threadId });
  const isUndone = thread?.undone === true;

  if (!isUndone) {
    const shouldArchive = markDone && action === CleanAction.ARCHIVE;
    const shouldMarkAsRead = markDone && action === CleanAction.MARK_READ;

    const coreAddLabelIds = [
      processedLabelId,
      markDone ? markedDoneLabelId : undefined,
    ].filter(isDefined);
    const removeLabelIds = [
      shouldArchive ? GmailLabel.INBOX : undefined,
      shouldMarkAsRead ? GmailLabel.UNREAD : undefined,
    ].filter(isDefined);

    logger.info("Handling thread", {
      threadId,
      shouldArchive,
      shouldMarkAsRead,
    });

    await labelThread({
      gmail,
      threadId,
      addLabelIds: coreAddLabelIds,
      removeLabelIds,
    });
  }

  // The AI-chosen label is best-effort: it may have been deleted or renamed
  // since the run started, so a stale labelId must not fail the thread action.
  // When the thread was undone, remove the label from Gmail instead of
  // applying it so it can't reappear after an undo — but only if this run
  // actually added it: a pre-existing label must survive an in-flight undo.
  let labelApplied = false;
  if (labelId) {
    try {
      await labelThread({
        gmail,
        threadId,
        addLabelIds: isUndone ? [] : [labelId],
        removeLabelIds: isUndone && labelAdded ? [labelId] : [],
      });
      labelApplied = !isUndone;
    } catch (error) {
      logger.warn("Failed to apply or remove AI-chosen label, continuing", {
        threadId,
        labelId,
        isUndone,
        error,
      });
    }
  }

  await saveCleanResult({
    emailAccountId,
    threadId,
    markDone: isUndone ? false : markDone,
    labelName: labelApplied ? labelName : undefined,
    labelId: labelApplied ? labelId : undefined,
    labelAdded: labelApplied ? labelAdded : undefined,
    // Redis holds the label optimistically from publish time; clear it when
    // Gmail never got it so the UI doesn't show a label that doesn't exist
    clearLabel: !!labelId && !labelApplied,
    jobId,
  });
}

async function saveCleanResult({
  emailAccountId,
  threadId,
  markDone,
  labelName,
  labelId,
  labelAdded,
  clearLabel,
  jobId,
}: {
  emailAccountId: string;
  threadId: string;
  markDone: boolean;
  labelName?: string;
  labelId?: string;
  labelAdded?: boolean;
  clearLabel: boolean;
  jobId: string;
}) {
  await Promise.all([
    updateThread({
      emailAccountId,
      jobId,
      threadId,
      update: { status: "completed", ...(clearLabel ? { label: null } : {}) },
    }),
    saveToDatabase({
      emailAccountId,
      threadId,
      archive: markDone,
      labelName,
      labelId,
      labelAdded,
      jobId,
    }),
  ]);
}

async function saveToDatabase({
  emailAccountId,
  threadId,
  archive,
  labelName,
  labelId,
  labelAdded,
  jobId,
}: {
  emailAccountId: string;
  threadId: string;
  archive: boolean;
  labelName?: string;
  labelId?: string;
  labelAdded?: boolean;
  jobId: string;
}) {
  await prisma.cleanupThread.create({
    data: {
      emailAccount: { connect: { id: emailAccountId } },
      threadId,
      archived: archive,
      label: labelName,
      labelId,
      labelAdded,
      job: { connect: { id: jobId } },
    },
  });
}

export const POST = withError(
  "clean/gmail",
  withQstashOrInternal(async (request: RequestWithLogger) => {
    assertCleanerApiEnabled();

    const json = await request.json();
    const body = cleanGmailSchema.parse(json);

    await performGmailAction({
      ...body,
      logger: request.logger,
    });

    return NextResponse.json({ success: true });
  }),
);
