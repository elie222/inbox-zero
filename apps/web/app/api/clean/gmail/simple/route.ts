import { NextResponse } from "next/server";
import { headers } from "next/headers";
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
import { env } from "@/env";
import { isValidInternalApiKey } from "@/utils/internal-api";

const cleanGmailSchema = z.object({
  emailAccountId: z.string(),
  threadId: z.string(),
  markDone: z.boolean(),
  action: z.enum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  markedDoneLabelId: z.string().optional(),
  processedLabelId: z.string().optional(),
  jobId: z.string(),
});
type CleanGmailBody = z.infer<typeof cleanGmailSchema>;

/**
 * Applies Gmail label changes to a thread based on the clean decision.
 * Handles archive (remove INBOX) or mark-read (remove UNREAD) actions,
 * adds processed/done labels, and persists the result.
 */
async function performGmailAction({
  emailAccountId,
  threadId,
  markDone,
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
    archived: shouldArchive,
    jobId,
  });
}

/**
 * Saves the clean result to both Redis (for real-time status) and the database.
 */
async function saveCleanResult({
  emailAccountId,
  threadId,
  archived,
  jobId,
}: {
  emailAccountId: string;
  threadId: string;
  archived: boolean;
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
      archive: archived,
      jobId,
    }),
  ]);
}

/**
 * Persists the cleanup thread record to the database for history tracking.
 */
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

// Alternative endpoint for self-hosted deployments without Qstash.
// Disabled when QSTASH_TOKEN is set (returns 403).
// Authenticates via internal API key instead of Qstash signature verification.
//
// Security note: The internal API key provides blanket access to all email accounts.
// This mirrors the QStash routes which trust signed requests without per-account validation.
// The internal API key is a trusted service credential for self-hosted deployments.
export const POST = withError(
  "clean/gmail/simple",
  async (request: Request) => {
    if (env.QSTASH_TOKEN) {
      return NextResponse.json(
        { error: "Qstash is set. This endpoint is disabled." },
        { status: 403 },
      );
    }

    const requestLogger = (request as RequestWithLogger).logger;

    if (!isValidInternalApiKey(await headers(), requestLogger)) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const json = await request.json();
    const body = cleanGmailSchema.parse(json);

    await performGmailAction({
      ...body,
      logger: requestLogger,
    });

    return NextResponse.json({ success: true });
  },
);
