import { z } from "zod";
import { NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getThreads } from "@/utils/gmail/thread";
import { getGmailClient } from "@/utils/gmail/client";

export type GetThreadsResponse = Awaited<ReturnType<typeof getGetThreads>>;
const getThreadsQuery = z.object({
  from: z.string(),
  labelId: z.string().nullish(),
});
type GetThreadsQuery = z.infer<typeof getThreadsQuery>;

async function getGetThreads(
  { from, labelId }: GetThreadsQuery,
  gmail: gmail_v1.Gmail,
) {
  const threads = await getThreads(
    `from:${from}`,
    labelId ? [labelId] : [],
    gmail,
    500,
  );
  return threads.threads || [];
}

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const labelId = searchParams.get("labelId");
  const query = getThreadsQuery.parse({ from, labelId });

  const gmail = getGmailClient(session);

  const result = await getGetThreads(query, gmail);

  return NextResponse.json(result);
});
