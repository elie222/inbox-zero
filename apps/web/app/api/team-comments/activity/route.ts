import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getConversationActivity } from "@/utils/team-comments/activity";

export type TeamActivityResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAuth("team-comments/activity", async (request) => {
  const query = new URL(request.url).searchParams;
  const memberId = query.get("memberId");
  if (!memberId)
    return NextResponse.json({ error: "Member ID required" }, { status: 400 });
  const beforeAt = query.get("beforeAt");
  const beforeId = query.get("beforeId");
  const before =
    beforeAt && beforeId
      ? { createdAt: new Date(beforeAt), id: beforeId }
      : undefined;
  if (before && Number.isNaN(before.createdAt.getTime()))
    return NextResponse.json(
      { error: "Invalid activity cursor" },
      { status: 400 },
    );
  const limit = Number(query.get("limit") ?? 50);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    return NextResponse.json(
      { error: "Invalid activity page" },
      { status: 400 },
    );
  return NextResponse.json(
    await getData(request.auth.userId, memberId, before, limit),
  );
});

async function getData(
  userId: string,
  memberId: string,
  before: { createdAt: Date; id: string } | undefined,
  limit: number,
) {
  return getConversationActivity({ userId, memberId }, { before, limit });
}
