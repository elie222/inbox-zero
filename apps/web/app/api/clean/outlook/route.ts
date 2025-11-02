import { type NextRequest, NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import { getOutlookClientWithRefresh } from "@/utils/outlook/client";
import {
  moveMessageToFolder,
  markMessageAsRead,
} from "@/utils/outlook/folders";
import { labelThread, getLabelById } from "@/utils/outlook/label";
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

  // In Outlook, threadId is the conversationId
  // We need to get all messages in this conversation and process each one
  const conversationId = threadId;

  try {
    // Get all messages in the conversation
    const client = outlook.getClient();
    const response: { value: { id: string }[] } = await client
      .api("/me/messages")
      .filter(`conversationId eq '${conversationId}'`)
      .select("id")
      .get();

    const messageIds = response.value.map((msg) => msg.id);

    if (messageIds.length === 0) {
      logger.warn("No messages found in conversation", { conversationId });
      return;
    }

    logger.info("Processing conversation messages", {
      conversationId,
      messageCount: messageIds.length,
    });

    // Perform archive operation on all messages
    if (shouldArchive) {
      await Promise.all(
        messageIds.map((messageId) =>
          moveMessageToFolder(outlook, messageId, WELL_KNOWN_FOLDERS.archive),
        ),
      );
      logger.info("Archived conversation", {
        conversationId,
        messageCount: messageIds.length,
      });
    }

    // Perform mark as read operation on all messages
    if (shouldMarkAsRead) {
      await Promise.all(
        messageIds.map((messageId) =>
          markMessageAsRead(outlook, messageId, true),
        ),
      );
      logger.info("Marked conversation as read", {
        conversationId,
        messageCount: messageIds.length,
      });
    }

    // Apply categories (Outlook's equivalent of Gmail labels)
    const categoriesToApply: string[] = [];

    if (processedLabelId) {
      try {
        const processedLabel = await getLabelById({
          client: outlook,
          id: processedLabelId,
        });
        if (processedLabel?.displayName) {
          categoriesToApply.push(processedLabel.displayName);
        }
      } catch (error) {
        logger.warn("Failed to get processed label", {
          processedLabelId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    if (markedDoneLabelId) {
      try {
        const markedDoneLabel = await getLabelById({
          client: outlook,
          id: markedDoneLabelId,
        });
        if (markedDoneLabel?.displayName) {
          categoriesToApply.push(markedDoneLabel.displayName);
        }
      } catch (error) {
        logger.warn("Failed to get marked done label", {
          markedDoneLabelId,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // Apply categories to all messages in the conversation
    if (categoriesToApply.length > 0) {
      try {
        await labelThread({
          client: outlook,
          threadId: conversationId,
          categories: categoriesToApply,
        });
        logger.info("Applied categories to conversation", {
          conversationId,
          categories: categoriesToApply,
          messageCount: messageIds.length,
        });
      } catch (error) {
        logger.warn("Failed to apply categories", {
          conversationId,
          categories: categoriesToApply,
          error: error instanceof Error ? error.message : error,
        });
      }
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
      conversationId,
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
