import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import {
  getSharedConversation,
  stopSharing,
} from "@/utils/team-comments/conversations";

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
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);

// Stops sharing. Only the publisher can do this.
export const DELETE = withAuth(
  "team-comments/conversation/stop",
  async (request, { params }) => {
    const { conversationId } = await params;
    const memberId = new URL(request.url).searchParams.get("memberId");
    if (!memberId)
      return NextResponse.json(
        { error: "Member ID required" },
        { status: 400 },
      );
    return NextResponse.json(
      await stopSharing(
        { userId: request.auth.userId, memberId },
        conversationId,
        request.logger,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
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
