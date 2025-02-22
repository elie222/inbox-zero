import { z } from "zod";
import { NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import {
  GmailLabel,
  getOrCreateInboxZeroLabel,
  labelThread,
} from "@/utils/gmail/label";
import { sleep } from "@/utils/sleep";
import { withError } from "@/utils/middleware";
import { getThreads } from "@/utils/gmail/thread";

const bulkArchiveBody = z.object({ daysAgo: z.string() });
export type BulkArchiveBody = z.infer<typeof bulkArchiveBody>;
export type BulkArchiveResponse = Awaited<ReturnType<typeof bulkArchive>>;

async function bulkArchive(body: BulkArchiveBody, gmail: gmail_v1.Gmail) {
  const { threads } = await getThreads(
    `older_than:${body.daysAgo}d`,
    [GmailLabel.INBOX],
    gmail,
    500,
  );

  console.log(`Archiving ${threads?.length} threads`);

  const archivedLabel = await getOrCreateInboxZeroLabel({
    gmail,
    key: "archived",
  });

  if (!archivedLabel.id)
    throw new Error("Failed to get or create archived label");

  for (const thread of threads || []) {
    await labelThread({
      gmail,
      threadId: thread.id!,
      addLabelIds: [archivedLabel.id],
      removeLabelIds: [GmailLabel.INBOX],
    });

    // we're allowed to archive 250/10 = 25 threads per second:
    // https://developers.google.com/gmail/api/reference/quota
    await sleep(40); // 1s / 25 = 40ms
  }

  return { count: threads?.length || 0 };
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = bulkArchiveBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await bulkArchive(body, gmail);

  return NextResponse.json(result);
});
