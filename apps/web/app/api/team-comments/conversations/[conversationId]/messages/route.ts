import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getSharedMessages } from "@/utils/team-comments/content";
import type { Logger } from "@/utils/logger";

export type TeamMessagesResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAuth(
  "team-comments/messages",
  async (request, { params }) => {
    const { conversationId } = await params;
    const memberId = new URL(request.url).searchParams.get("memberId");
    if (!memberId)
      return NextResponse.json(
        { error: "Member ID required" },
        { status: 400 },
      );
    return NextResponse.json(
      await getData(
        request.auth.userId,
        memberId,
        conversationId,
        request.logger,
      ),
    );
  },
);

async function getData(
  userId: string,
  memberId: string,
  conversationId: string,
  logger: Logger,
) {
  return getSharedMessages({ userId, memberId }, conversationId, logger);
}
