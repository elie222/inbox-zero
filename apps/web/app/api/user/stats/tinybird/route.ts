import { NextResponse } from "next/server";
import { getEmailsByWeek } from "@inboxzero/tinybird";
import { getAuthSession } from "@/utils/auth";
import { withError } from "@/utils/middleware";

export type StatsByWeekResponse = Awaited<ReturnType<typeof getStatsByWeek>>;

async function getStatsByWeek(options: { email: string }) {
  const result = await getEmailsByWeek({ ownerEmail: options.email });
  return { result };
}

export const GET = withError(async () => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const result = await getStatsByWeek({ email: session.user.email });

  return NextResponse.json(result);
});
