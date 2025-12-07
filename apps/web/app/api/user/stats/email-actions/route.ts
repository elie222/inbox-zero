import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailActionsByDay, isTinybirdEnabled } from "@inboxzero/tinybird";

export type EmailActionStatsResponse = Awaited<
  ReturnType<typeof getEmailActionStats>
>;

async function getEmailActionStats({ userEmail }: { userEmail: string }) {
  if (!isTinybirdEnabled()) {
    return { result: [], disabled: true as const };
  }

  const result = (
    await getEmailActionsByDay({ ownerEmail: userEmail })
  ).data.map((d) => ({
    date: d.date,
    Archived: d.archive_count,
    Deleted: d.delete_count,
  }));

  return { result, disabled: false as const };
}

export const GET = withEmailAccount(
  async (request) => {
    const userEmail = request.auth.email;

    const result = await getEmailActionStats({ userEmail });

    return NextResponse.json(result);
  },
  { allowOrgAdmins: true },
);
