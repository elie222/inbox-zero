import { NextResponse } from "next/server";
import { participantAccessBody } from "@/utils/actions/team-comments.validation";
import { withAuth } from "@/utils/middleware";
import { setParticipantAccess } from "@/utils/team-comments/conversations";

// Adds or removes a teammate. Only the publisher can do this.
export const POST = withAuth(
  "team-comments/participants",
  async (request, { params }) => {
    const { conversationId } = await params;
    const { memberId, targetMemberId, access } = participantAccessBody.parse(
      await request.json(),
    );
    return NextResponse.json(
      await setParticipantAccess(
        { userId: request.auth.userId, memberId },
        {
          conversationId,
          memberId: targetMemberId,
          access,
          logger: request.logger,
        },
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  },
);
