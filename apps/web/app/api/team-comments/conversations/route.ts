import { NextResponse } from "next/server";
import { shareConversationInput } from "@/utils/actions/team-comments.validation";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { getOwnedMember } from "@/utils/team-comments/access";
import {
  getShareForSource,
  listSharedConversations,
  shareConversation,
} from "@/utils/team-comments/conversations";

export type TeamConversationsResponse = Awaited<ReturnType<typeof getData>>;
export type ShareTeamConversationResponse = Awaited<
  ReturnType<typeof shareConversation>
>;

export const GET = withAuth("team-comments/conversations", async (request) =>
  NextResponse.json(
    await getData(request.auth.userId, new URL(request.url).searchParams),
    { headers: { "Cache-Control": "private, no-store" } },
  ),
);

export const POST = withAuth(
  "team-comments/conversations/share",
  async (request) => {
    const { memberId, ...input } = shareConversationInput.parse(
      await request.json(),
    );
    const shared = await shareConversation(
      { userId: request.auth.userId, memberId },
      { ...input, logger: request.logger },
    );
    return NextResponse.json(shared satisfies ShareTeamConversationResponse, {
      headers: { "Cache-Control": "private, no-store" },
    });
  },
);

async function getData(userId: string, params: URLSearchParams) {
  const memberId = params.get("memberId");
  if (!memberId) {
    const memberships = await prisma.member.findMany({
      where: { emailAccount: { userId } },
      select: {
        id: true,
        organization: {
          select: { name: true, _count: { select: { members: true } } },
        },
        emailAccount: { select: { id: true, email: true } },
      },
    });
    return { memberships, conversations: [], source: null, teammates: [] };
  }
  const actor = { userId, memberId };
  const member = await getOwnedMember(actor);
  const sourceAccountId = params.get("emailAccountId");
  const threadId = params.get("threadId");
  const source =
    sourceAccountId && threadId
      ? await getShareForSource(actor, {
          emailAccountId: sourceAccountId,
          threadId,
        })
      : null;
  const teammates =
    sourceAccountId && threadId
      ? await prisma.member.findMany({
          where: {
            organizationId: member.organizationId,
            id: { not: member.id },
          },
          select: {
            id: true,
            emailAccount: { select: { name: true, email: true, image: true } },
          },
        })
      : [];
  return {
    memberships: [],
    conversations: await listSharedConversations(actor),
    source,
    teammates,
  };
}
