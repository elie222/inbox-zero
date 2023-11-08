import { NextResponse } from "next/server";
import { subDays } from "date-fns";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getNewsletterCounts } from "@inboxzero/tinybird";

export type InsightsResponse = Awaited<ReturnType<typeof getInsights>>;

async function getInsights(options: { email: string }) {
  // Fetch newsletter data
  const oneMonthAgo = subDays(new Date(), 30);

  const newsletterCounts = await getNewsletterCounts({
    ownerEmail: options.email,
    fromDate: +oneMonthAgo,
    orderBy: "emails",
    all: true,
    read: false,
    unread: false,
    archived: false,
    unarchived: false,
    limit: 50,
  });

  const READ_THRESHOLD = 0.3;

  const lowReadEmails = newsletterCounts.data.filter(
    (newsletter) => newsletter.readEmails / newsletter.count < READ_THRESHOLD
  );

  return {
    result: {
      lowReadEmails,
    },
  };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getInsights({ email: session.user.email });

  return NextResponse.json(result);
});
