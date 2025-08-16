import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getEmailActionsByDay } from "@inboxzero/tinybird";

export type EmailActionStatsResponse = Awaited<
  ReturnType<typeof getEmailActionStats>
>;

async function getEmailActionStats({ userEmail }: { userEmail: string }) {
  // Check if Tinybird is configured
  if (!process.env.TINYBIRD_TOKEN) {
    return { result: [] };
  }

  try {
    const result = (
      await getEmailActionsByDay({ ownerEmail: userEmail })
    ).data.map((d) => ({
      date: d.date,
      Archived: d.archive_count,
      Deleted: d.delete_count,
    }));

    return { result };
  } catch (_error) {
    return { result: [] };
  }
}

export const GET = withEmailAccount(async (request) => {
  try {
    const userEmail = request.auth.email;

    if (!userEmail) {
      return NextResponse.json(
        { error: "User email not found" },
        { status: 400 },
      );
    }

    const result = await getEmailActionStats({ userEmail });

    return NextResponse.json(result);
  } catch (_error) {
    return NextResponse.json(
      { error: "Failed to fetch email action stats" },
      { status: 500 },
    );
  }
});
