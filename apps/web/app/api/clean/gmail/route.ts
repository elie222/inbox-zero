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
import { updateThread } from "@/utils/redis/clean";
import { withQstashOrInternal } from "@/utils/qstash";
import { assertCleanerApiEnabled } from "@/utils/cleaner-feature";

const cleanGmailSchema = z.object({
  emailAccountId: z.string(),
  threadId: z.string(),
  markDone: z.boolean(),
  action: z.enum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  labelId: z.string().optional(),
  labelName: z.string().optional(),
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

  logger.info("Handling thread", { threadId, shouldArchive, shouldMarkAsRead });

  await labelThread({
    gmail,
    threadId,
    addLabelIds: coreAddLabelIds,
    removeLabelIds,
  });

  // The AI-chosen label is best-effort: it may have been deleted or renamed
  // since the run started, so a stale labelId must not fail the thread action.
  let labelApplied = false;
  if (labelId) {
    try {
      await labelThread({
        gmail,
        threadId,
        addLabelIds: [labelId],
      });
      labelApplied = true;
    } catch (error) {
      logger.warn("Failed to apply AI-chosen label, continuing", {
        threadId,
        labelId,
        error,
      });
    }
  }

  await saveCleanResult({
    emailAccountId,
    threadId,
    markDone,
    labelName: labelApplied ? labelName : undefined,
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
  clearLabel,
  jobId,
}: {
  emailAccountId: string;
  threadId: string;
  markDone: boolean;
  labelName?: string;
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
      jobId,
    }),
  ]);
}

async function saveToDatabase({
  emailAccountId,
  threadId,
  archive,
  labelName,
  jobId,
}: {
  emailAccountId: string;
  threadId: string;
  archive: boolean;
  labelName?: string;
  jobId: string;
}) {
  await prisma.cleanupThread.create({
    data: {
      emailAccount: { connect: { id: emailAccountId } },
      threadId,
      archived: archive,
      label: labelName,
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
