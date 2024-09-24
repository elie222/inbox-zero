import { z } from "zod";
import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getEmailActionsByDay } from "@inboxzero/tinybird";

export type EmailActionStatsResponse = Awaited<
  ReturnType<typeof getEmailActionStats>
>;

async function getEmailActionStats(options: { email: string }) {
  const result = (
    await getEmailActionsByDay({ ownerEmail: options.email })
  ).data.map((d) => ({
    date: d.date,
    Archived: d.archive_count,
    Deleted: d.delete_count,
  }));

  return { result };
}

export const GET = withError(async () => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const result = await getEmailActionStats({ email: session.user.email });

  return NextResponse.json(result);
});
