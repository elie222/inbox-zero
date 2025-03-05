import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getGmailClient } from "@/utils/gmail/client";
import { GmailLabel, labelThread } from "@/utils/gmail/label";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { isDefined } from "@/utils/types";

const cleanGmailSchema = z.object({
  userId: z.string(),
  threadId: z.string(),
  archive: z.boolean(),
  labelId: z.string().optional(),
  archiveLabelId: z.string().optional(),
});
export type CleanGmailBody = z.infer<typeof cleanGmailSchema>;

async function performGmailAction({
  userId,
  threadId,
  archive,
  labelId,
  archiveLabelId,
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

  await labelThread({
    gmail,
    threadId,
    addLabelIds: [archiveLabelId, labelId].filter(isDefined),
    removeLabelIds: archive ? [GmailLabel.INBOX] : undefined,
  });
}

// TODO: security
export const POST = withError(async (request: NextRequest) => {
  const json = await request.json();
  const body = cleanGmailSchema.parse(json);

  await performGmailAction(body);

  return NextResponse.json({ success: true });
});
