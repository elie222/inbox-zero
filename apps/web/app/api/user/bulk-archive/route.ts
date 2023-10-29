import { z } from "zod";
import { NextResponse } from "next/server";
import { gmail_v1 } from "googleapis";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { INBOX_LABEL_ID, getOrCreateInboxZeroLabels } from "@/utils/label";
import { sleep } from "@/utils/sleep";
import { withError } from "@/utils/middleware";

const bulkArchiveBody = z.object({ daysAgo: z.string() });
export type BulkArchiveBody = z.infer<typeof bulkArchiveBody>;
export type BulkArchiveResponse = Awaited<ReturnType<typeof bulkArchive>>;

async function bulkArchive(
  body: BulkArchiveBody,
  gmail: gmail_v1.Gmail,
  email: string
) {
  const res = await gmail.users.threads.list({
    userId: "me",
    maxResults: 500,
    q: `older_than:${body.daysAgo}d`,
    labelIds: [INBOX_LABEL_ID],
  });

  console.log(`Archiving ${res.data.threads?.length} threads`);

  const izLabels = await getOrCreateInboxZeroLabels(email, gmail);

  for (const thread of res.data.threads || []) {
    await gmail.users.threads.modify({
      userId: "me",
      id: thread.id!,
      requestBody: {
        addLabelIds: [izLabels["archived"].id],
        removeLabelIds: [INBOX_LABEL_ID],
      },
    });

    // we're allowed to archive 250/10 = 25 threads per second:
    // https://developers.google.com/gmail/api/reference/quota
    await sleep(40); // 1s / 25 = 40ms
  }

  return { count: res.data.threads?.length || 0 };
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = bulkArchiveBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await bulkArchive(body, gmail, session.user.email);

  return NextResponse.json(result);
});
