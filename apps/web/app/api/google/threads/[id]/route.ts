import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import { NextResponse } from "next/server";
import { parseMessages } from "@/utils/mail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { withError } from "@/utils/middleware";
import { getThread as getGmailThread } from "@/utils/gmail/thread";
import { GmailLabel } from "@/utils/gmail/label";

export const dynamic = "force-dynamic";

const threadQuery = z.object({
  id: z.string(),
  includeDrafts: z.boolean().nullish(),
});
export type ThreadQuery = z.infer<typeof threadQuery>;
export type ThreadResponse = Awaited<ReturnType<typeof getThread>>;

async function getThread(query: ThreadQuery, gmail: gmail_v1.Gmail) {
  const thread = await getGmailThread(query.id, gmail);

  const messages = parseMessages(thread).filter((message) => {
    if (!query.includeDrafts)
      return !message.labelIds?.includes(GmailLabel.DRAFT);
    return true;
  });

  return { thread: { ...thread, messages } };
}

export const GET = withError(async (_request, { params }) => {
  const query = threadQuery.parse(params);

  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);

  const thread = await getThread(query, gmail);

  return NextResponse.json(thread);
});
