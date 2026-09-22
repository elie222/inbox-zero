import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getComments } from "@/utils/team-comments/comments";

export type TeamCommentsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAuth(
  "team-comments/comments",
  async (request, { params }) => {
    const { conversationId } = await params;
    const query = new URL(request.url).searchParams;
    const memberId = query.get("memberId");
    if (!memberId)
      return NextResponse.json(
        { error: "Member ID required" },
        { status: 400 },
      );
    const beforeRevision = query.has("beforeRevision")
      ? Number(query.get("beforeRevision"))
      : undefined;
    const limit = Number(query.get("limit") ?? 100);
    if (
      (beforeRevision !== undefined &&
        (!Number.isSafeInteger(beforeRevision) || beforeRevision < 1)) ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      return NextResponse.json(
        { error: "Invalid comment page" },
        { status: 400 },
      );
    return NextResponse.json(
      await getData(
        request.auth.userId,
        memberId,
        conversationId,
        beforeRevision,
        limit,
      ),
    );
  },
);

async function getData(
  userId: string,
  memberId: string,
  conversationId: string,
  beforeRevision: number | undefined,
  limit: number,
) {
  return getComments(
    { userId, memberId },
    { conversationId, beforeRevision, limit },
  );
}
