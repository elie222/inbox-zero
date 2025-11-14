import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { z } from "zod";
import { withError, type RequestWithLogger } from "@/utils/middleware";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { GmailLabel, labelThread } from "@/utils/gmail/label";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { isDefined } from "@/utils/types";
import type { Logger } from "@/utils/logger";
import { CleanAction } from "@prisma/client";
import { updateThread } from "@/utils/redis/clean";

const cleanGmailSchema = z.object({
  emailAccountId: z.string(),
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
  emailAccountId,
  threadId,
  markDone,
  // labelId,
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
    emailAccountId,
    threadId,
    markDone,
    jobId,
  });
}

async function saveCleanResult({
  emailAccountId,
  threadId,
  markDone,
  jobId,
}: {
  emailAccountId: string;
  threadId: string;
  markDone: boolean;
  jobId: string;
}) {
  await Promise.all([
    updateThread({
      emailAccountId,
      jobId,
      threadId,
      update: { status: "completed" },
    }),
    saveToDatabase({
      emailAccountId,
      threadId,
      archive: markDone,
      jobId,
    }),
  ]);
}

async function saveToDatabase({
  emailAccountId,
  threadId,
  archive,
  jobId,
}: {
  emailAccountId: string;
  threadId: string;
  archive: boolean;
  jobId: string;
}) {
  await prisma.cleanupThread.create({
    data: {
      emailAccount: { connect: { id: emailAccountId } },
      threadId,
      archived: archive,
      job: { connect: { id: jobId } },
    },
  });
}

export const POST = withError(
  "clean/gmail",
  verifySignatureAppRouter(async (request: Request) => {
    const json = await request.json();
    const body = cleanGmailSchema.parse(json);

    await performGmailAction({
      ...body,
      logger: (request as RequestWithLogger).logger,
    });

    return NextResponse.json({ success: true });
  }),
);
