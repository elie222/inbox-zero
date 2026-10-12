import { NextResponse } from "next/server";
import { commentBody } from "@/utils/actions/team-comments.validation";
import { withAuth } from "@/utils/middleware";
import { getComments, postComment } from "@/utils/team-comments/comments";

export type TeamCommentsResponse = Awaited<ReturnType<typeof getData>>;
export type PostTeamCommentResponse = Awaited<ReturnType<typeof postComment>>;

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
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);

export const POST = withAuth(
  "team-comments/comments/post",
  async (request, { params }) => {
    const { conversationId } = await params;
    const { memberId, ...input } = commentBody.parse(await request.json());
    const comment = await postComment(
      { userId: request.auth.userId, memberId },
      { ...input, conversationId, logger: request.logger },
    );
    return NextResponse.json(comment satisfies PostTeamCommentResponse, {
      headers: { "Cache-Control": "private, no-store" },
    });
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
