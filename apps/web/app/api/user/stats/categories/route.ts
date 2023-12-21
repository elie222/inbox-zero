import { NextResponse } from "next/server";
import countBy from "lodash/countBy";
import { gmail_v1 } from "googleapis";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { getCategory } from "@/utils/redis/category";
import { withError } from "@/utils/middleware";

export type CategoryStatsResponse = Awaited<
  ReturnType<typeof getCategoryStats>
>;

async function getCategoryStats(options: {
  gmail: gmail_v1.Gmail;
  email: string;
}) {
  const { gmail, email } = options;

  // NOTE we're using threads here instead of messages unlike other stats
  const res = await gmail.users.threads.list({
    userId: "me",
    q: `-in:sent`,
    maxResults: 50,
  });

  const threads = await Promise.all(
    res.data.threads?.map(async (t) => {
      if (!t.id) return;
      const category = await getCategory({ email, threadId: t.id });
      return { ...t, category };
    }) || [],
  );

  const countByCategory = countBy(threads, (t) => t?.category?.category);

  return { countByCategory };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);

  const result = await getCategoryStats({ gmail, email: session.user.email });

  return NextResponse.json(result);
});
