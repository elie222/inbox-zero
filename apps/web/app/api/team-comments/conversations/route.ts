import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { getOwnedMember } from "@/utils/team-comments/access";
import {
  getShareForSource,
  listSharedConversations,
} from "@/utils/team-comments/conversations";

export type TeamConversationsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAuth("team-comments/conversations", async (request) =>
  NextResponse.json(
    await getData(request.auth.userId, new URL(request.url).searchParams),
  ),
);

async function getData(userId: string, params: URLSearchParams) {
  const memberId = params.get("memberId");
  if (!memberId) {
    const memberships = await prisma.member.findMany({
      where: { emailAccount: { userId } },
      select: {
        id: true,
        organization: { select: { name: true } },
        emailAccount: { select: { id: true, email: true } },
      },
    });
    return { memberships, conversations: [], source: null, teammates: [] };
  }
  const actor = { userId, memberId };
  const member = await getOwnedMember(actor);
  const sourceAccountId = params.get("emailAccountId");
  const providerConversationId = params.get("providerConversationId");
  const source =
    sourceAccountId && providerConversationId
      ? await getShareForSource(actor, {
          emailAccountId: sourceAccountId,
          providerConversationId,
        })
      : null;
  const teammates =
    sourceAccountId && providerConversationId
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
