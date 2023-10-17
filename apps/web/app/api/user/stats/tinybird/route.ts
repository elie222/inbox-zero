import { NextResponse } from "next/server";
import { getEmailsByWeek } from "@inboxzero/tinybird";
import { getAuthSession } from "@/utils/auth";
import { withError } from "@/utils/middleware";
import { format } from "date-fns";

export type StatsByWeekResponse = Awaited<ReturnType<typeof getStatsByWeek>>;

async function getStatsByWeek(options: { email: string }) {
  const result = await getEmailsByWeek({ ownerEmail: options.email });

  // could also change this at the query level
  const stats = result.data.map((d) => ({
    week_start: format(d.week_start, "LLL dd, y"),
    Emails: d.count,
  }));

  return { stats };
}

export const GET = withError(async () => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const result = await getStatsByWeek({ email: session.user.email });

  return NextResponse.json(result);
});
