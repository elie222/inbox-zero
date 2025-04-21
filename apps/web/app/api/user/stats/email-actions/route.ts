import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getEmailActionsByDay } from "@inboxzero/tinybird";

export type EmailActionStatsResponse = Awaited<
  ReturnType<typeof getEmailActionStats>
>;

async function getEmailActionStats({ email }: { email: string }) {
  const result = (await getEmailActionsByDay({ ownerEmail: email })).data.map(
    (d) => ({
      date: d.date,
      Archived: d.archive_count,
      Deleted: d.delete_count,
    }),
  );

  return { result };
}

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;

  const result = await getEmailActionStats({ email });

  return NextResponse.json(result);
});
