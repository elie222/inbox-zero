import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getSharedConversation } from "@/utils/team-comments/conversations";

export type TeamConversationResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAuth(
  "team-comments/conversation",
  async (request, { params }) => {
    const { conversationId } = await params;
    const memberId = new URL(request.url).searchParams.get("memberId");
    if (!memberId)
      return NextResponse.json(
        { error: "Member ID required" },
        { status: 400 },
      );
    return NextResponse.json(
      await getData(request.auth.userId, memberId, conversationId),
    );
  },
);

async function getData(
  userId: string,
  memberId: string,
  conversationId: string,
) {
  return getSharedConversation({ userId, memberId }, conversationId);
}
