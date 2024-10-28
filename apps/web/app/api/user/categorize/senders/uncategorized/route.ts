import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { findSenders } from "@/app/api/user/categorize/senders/find-senders";
import { gmail_v1 } from "@googleapis/gmail";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";

export type UncategorizedSendersResponse = Awaited<
  ReturnType<typeof getUncategorizedSenders>
>;

async function getUncategorizedSenders({
  gmail,
  accessToken,
  userId,
}: {
  gmail: gmail_v1.Gmail;
  accessToken: string;
  userId: string;
}) {
  let uncategorizedSenders: string[] = [];
  let pageToken: string | undefined;
  let pagesFetched = 0;

  const stopAfterSenders = 20;
  const maxPages = 3;
  const perPage = 100;

  while (
    uncategorizedSenders.length < stopAfterSenders &&
    pagesFetched < maxPages
  ) {
    console.log(`Fetching page ${pagesFetched}`);
    const senders = await findSenders(gmail, accessToken, pageToken, perPage);
    pageToken = senders.nextPageToken || undefined;
    pagesFetched++;

    const existingSenders = await prisma.newsletter.findMany({
      where: {
        email: { in: Array.from(senders.senders.keys()) },
        userId,
      },
      select: { email: true, categoryId: true },
    });

    const newUncategorizedSenders = Array.from(senders.senders.keys()).filter(
      (sender) => !existingSenders.some((s) => s.email === sender),
    );

    uncategorizedSenders = uncategorizedSenders.concat(newUncategorizedSenders);

    if (!pageToken) break; // Exit if there are no more pages
  }

  return { uncategorizedSenders: uncategorizedSenders };
}

export const GET = withError(async () => {
  const { gmail, user, error, session } = await getSessionAndGmailClient();
  if (!user?.email) return NextResponse.json({ error: "Not authenticated" });
  if (error) return NextResponse.json({ error });
  if (!gmail) return NextResponse.json({ error: "Could not load Gmail" });
  if (!session?.accessToken)
    return NextResponse.json({ error: "No access token" });

  const result = await getUncategorizedSenders({
    gmail,
    accessToken: session.accessToken,
    userId: user.id,
  });

  return NextResponse.json(result);
});
