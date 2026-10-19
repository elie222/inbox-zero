import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { countUnreadConversations } from "@/utils/team-comments/activity";

export type TeamUnreadCountResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAuth("team-comments/unread-count", async (request) =>
  NextResponse.json(await getData(request.auth.userId), {
    headers: { "Cache-Control": "private, no-store" },
  }),
);

async function getData(userId: string) {
  return { count: await countUnreadConversations(userId) };
}
