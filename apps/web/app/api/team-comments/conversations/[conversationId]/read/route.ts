import { NextResponse } from "next/server";
import { readConversationBody } from "@/utils/actions/team-comments.validation";
import { withAuth } from "@/utils/middleware";
import { markConversationRead } from "@/utils/team-comments/activity";

export const POST = withAuth(
  "team-comments/read",
  async (request, { params }) => {
    const { conversationId } = await params;
    const { memberId, throughRevision } = readConversationBody.parse(
      await request.json(),
    );
    return NextResponse.json(
      await markConversationRead(
        { userId: request.auth.userId, memberId },
        { conversationId, throughRevision },
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);
