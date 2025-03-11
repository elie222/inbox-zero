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
import { saveCleanResult } from "@/app/api/clean/save-result";
import { CleanAction } from "@prisma/client";

const logger = createScopedLogger("api/clean/gmail");

const cleanGmailSchema = z.object({
  userId: z.string(),
  threadId: z.string(),
  archive: z.boolean(),
  action: z.enum([CleanAction.ARCHIVE, CleanAction.MARK_READ]),
  labelId: z.string().optional(),
  archiveLabelId: z.string().optional(),
  processedLabelId: z.string().optional(),
  jobId: z.string(),
});
export type CleanGmailBody = z.infer<typeof cleanGmailSchema>;

async function performGmailAction({
  userId,
  threadId,
  archive,
  labelId,
  archiveLabelId,
  processedLabelId,
  jobId,
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

  const addLabelIds = [
    archive ? archiveLabelId : processedLabelId,
    labelId,
  ].filter(isDefined);
  const removeLabelIds = archive ? [GmailLabel.INBOX] : undefined;

  logger.info("Labeling thread", {
    threadId,
    // addLabelIds,
    // removeLabelIds,
  });

  await labelThread({
    gmail,
    threadId,
    addLabelIds,
    removeLabelIds,
  });

  await saveCleanResult({
    userId,
    threadId,
    archive,
    jobId,
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
