import { z } from "zod";
import { NextResponse } from "next/server";
import type { gmail_v1 } from "@googleapis/gmail";
import { withAuth } from "@/utils/middleware";
import { getThreads } from "@/utils/gmail/thread";
import { getGmailClientForEmail } from "@/utils/account";

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

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;
  const gmail = await getGmailClientForEmail({ email });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const labelId = searchParams.get("labelId");
  const query = getThreadsQuery.parse({ from, labelId });

  const result = await getGetThreads(query, gmail);

  return NextResponse.json(result);
});
