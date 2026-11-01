import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { deleteComment } from "@/utils/team-comments/comments";

export const DELETE = withAuth(
  "team-comments/comments/delete",
  async (request, { params }) => {
    const { conversationId, commentId } = await params;
    const memberId = new URL(request.url).searchParams.get("memberId");
    if (!memberId)
      return NextResponse.json(
        { error: "Member ID required" },
        { status: 400 },
      );
    return NextResponse.json(
      await deleteComment(
        { userId: request.auth.userId, memberId },
        { conversationId, commentId, logger: request.logger },
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);
