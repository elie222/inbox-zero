import { type NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/dist/nextjs";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import { getGmailClient } from "@/utils/gmail/client";
import { GmailLabel, labelThread } from "@/utils/gmail/label";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { isDefined } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import { CleanAction } from "@prisma/client";
import { updateThread } from "@/utils/redis/clean";

const logger = createScopedLogger("api/clean/gmail");

const cleanGmailSchema = z.object({
  userId: z.string(),
  threadId: z.string(),
  markDone: z.boolean(),
  action: z.enum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  // labelId: z.string().optional(),
  markedDoneLabelId: z.string().optional(),
  processedLabelId: z.string().optional(),
  jobId: z.string(),
});
export type CleanGmailBody = z.infer<typeof cleanGmailSchema>;

async function performGmailAction({
  userId,
  threadId,
  markDone,
  // labelId,
  markedDoneLabelId,
  processedLabelId,
  jobId,
  action,
}: CleanGmailBody) {
  const account = await prisma.account.findUnique({
    where: { userId },
    select: { access_token: true, refresh_token: true },
  });

  if (!account) throw new SafeError("User not found", 404);
  if (!account.access_token || !account.refresh_token)
    throw new SafeError("No Gmail account found", 404);

  const gmail = getGmailClient({
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
  });

  const shouldArchive = markDone && action === CleanAction.ARCHIVE;
  const shouldMarkAsRead = markDone && action === CleanAction.MARK_READ;

  const addLabelIds = [
    processedLabelId,
    markDone ? markedDoneLabelId : undefined,
    // labelId,
  ].filter(isDefined);
  const removeLabelIds = [
    shouldArchive ? GmailLabel.INBOX : undefined,
    shouldMarkAsRead ? GmailLabel.UNREAD : undefined,
  ].filter(isDefined);

  logger.info("Handling thread", { threadId, shouldArchive, shouldMarkAsRead });

  await labelThread({
    gmail,
    threadId,
    addLabelIds,
    removeLabelIds,
  });

  await saveCleanResult({
    userId,
    threadId,
    markDone,
    jobId,
  });
}

async function saveCleanResult({
  userId,
  threadId,
  markDone,
  jobId,
}: {
  userId: string;
  threadId: string;
  markDone: boolean;
  jobId: string;
}) {
  await Promise.all([
    updateThread(userId, jobId, threadId, { status: "completed" }),
    saveToDatabase({
      userId,
      threadId,
      archive: markDone,
      jobId,
    }),
  ]);
}

async function saveToDatabase({
  userId,
  threadId,
  archive,
  jobId,
}: {
  userId: string;
  threadId: string;
  archive: boolean;
  jobId: string;
}) {
  await prisma.cleanupThread.create({
    data: {
      userId,
      threadId,
      archived: archive,
      jobId,
    },
  });
}

export const POST = withError(
  verifySignatureAppRouter(async (request: NextRequest) => {
    const json = await request.json();
    const body = cleanGmailSchema.parse(json);

    await performGmailAction(body);

    return NextResponse.json({ success: true });
  }),
);
