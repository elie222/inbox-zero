import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { countUnreadConversations } from "@/utils/team-comments/activity";

export type TeamUnreadCountResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(
  "team-comments/unread-count",
  async (request) =>
    NextResponse.json(await getData(request.auth.emailAccountId), {
      headers: { "Cache-Control": "private, no-store" },
    }),
);

async function getData(emailAccountId: string) {
  return { count: await countUnreadConversations(emailAccountId) };
}
