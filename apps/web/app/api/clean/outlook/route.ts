import { type NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import { getOutlookClientWithRefresh } from "@/utils/outlook/client";
import {
  moveMessageToFolder,
  markMessageAsRead,
} from "@/utils/outlook/folders";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { isDefined } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import { CleanAction } from "@prisma/client";
import { updateThread } from "@/utils/redis/clean";
import { WELL_KNOWN_FOLDERS } from "@/utils/outlook/message";

const logger = createScopedLogger("api/clean/outlook");

const cleanOutlookSchema = z.object({
  emailAccountId: z.string(),
  threadId: z.string(),
  markDone: z.boolean(),
  action: z.enum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  markedDoneLabelId: z.string().optional(),
  processedLabelId: z.string().optional(),
  jobId: z.string(),
});
export type CleanOutlookBody = z.infer<typeof cleanOutlookSchema>;

async function performOutlookAction({
  emailAccountId,
  threadId,
  markDone,
  markedDoneLabelId,
  processedLabelId,
  jobId,
  action,
}: CleanOutlookBody) {
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
    throw new SafeError("No Outlook account found", 404);

  const outlook = await getOutlookClientWithRefresh({
    accessToken: account.account.access_token,
    refreshToken: account.account.refresh_token,
    expiresAt: account.account.expires_at?.getTime() || null,
    emailAccountId,
  });

  const shouldArchive = markDone && action === CleanAction.ARCHIVE;
  const shouldMarkAsRead = markDone && action === CleanAction.MARK_READ;

  logger.info("Handling thread", { threadId, shouldArchive, shouldMarkAsRead });

  // In Outlook, threadId is actually the conversationId
  // We need to get all messages in this conversation and process them
  // For now, we'll just process the message with this ID
  // Note: threadId in Outlook context is actually a messageId
  const messageId = threadId;

  try {
    // Perform archive operation (move to Archive folder)
    if (shouldArchive) {
      await moveMessageToFolder({
        client: outlook,
        messageId,
        destinationFolderId: WELL_KNOWN_FOLDERS.archive,
      });
      logger.info("Archived message", { messageId });
    }

    // Perform mark as read operation
    if (shouldMarkAsRead) {
      await markMessageAsRead({
        client: outlook,
        messageId,
        read: true,
      });
      logger.info("Marked message as read", { messageId });
    }

    // Note: Outlook doesn't have a direct equivalent to Gmail's label system
    // We could use categories instead, but for now we're skipping the labeling
    // functionality as the core archive/mark-read operations are what matter most
    if (processedLabelId || markedDoneLabelId) {
      logger.info(
        "Skipping label operations for Outlook (categories not yet implemented)",
        {
          processedLabelId,
          markedDoneLabelId,
        },
      );
    }

    await saveCleanResult({
      emailAccountId,
      threadId,
      markDone,
      jobId,
    });
  } catch (error) {
    logger.error("Error performing Outlook action", {
      error,
      messageId,
      shouldArchive,
      shouldMarkAsRead,
    });
    throw error;
  }
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
  verifySignatureAppRouter(async (request: NextRequest) => {
    const json = await request.json();
    const body = cleanOutlookSchema.parse(json);

    await performOutlookAction(body);

    return NextResponse.json({ success: true });
  }),
);
