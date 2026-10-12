import { NextResponse } from "next/server";
import { muteConversationBody } from "@/utils/actions/team-comments.validation";
import { withAuth } from "@/utils/middleware";
import { setConversationMuted } from "@/utils/team-comments/activity";

export const POST = withAuth(
  "team-comments/mute",
  async (request, { params }) => {
    const { conversationId } = await params;
    const { memberId, muted } = muteConversationBody.parse(
      await request.json(),
    );
    return NextResponse.json(
      await setConversationMuted(
        { userId: request.auth.userId, memberId },
        { conversationId, muted },
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);
