import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import {
  getAuthorizedConversation,
  getOwnedMember,
  type ConversationActor,
} from "@/utils/team-comments/access";

export async function markConversationRead(
  actor: ConversationActor,
  input: {
    conversationId: string;
    throughRevision: number;
  },
) {
  const { conversation, participant } = await getAuthorizedConversation(
    actor,
    input.conversationId,
  );
  if (
    input.throughRevision > conversation.revision ||
    input.throughRevision < 0
  )
    throw new SafeError("Invalid read position");
  await prisma.conversationParticipant.updateMany({
    where: {
      id: participant.id,
      memberId: actor.memberId,
      generation: conversation.generation,
      active: true,
      readRevision: { lt: input.throughRevision },
      conversation: { status: "ACTIVE", generation: conversation.generation },
    },
    data: { readRevision: input.throughRevision },
  });
  return {
    readRevision: Math.max(participant.readRevision, input.throughRevision),
  };
}

export async function setConversationMuted(
  actor: ConversationActor,
  input: {
    conversationId: string;
    muted: boolean;
  },
) {
  const { conversation, participant } = await getAuthorizedConversation(
    actor,
    input.conversationId,
  );
  await prisma.conversationParticipant.update({
    where: {
      id: participant.id,
      memberId: actor.memberId,
      generation: conversation.generation,
      active: true,
    },
    data: { muted: input.muted },
  });
  return { muted: input.muted };
}

export async function getConversationActivity(
  actor: ConversationActor,
  input: {
    before?: { createdAt: Date; id: string };
    limit: number;
  },
) {
  const member = await getOwnedMember(actor);
  const page = await prisma.conversationActivity.findMany({
    where: {
      participant: {
        memberId: member.id,
        active: true,
        conversation: {
          status: "ACTIVE",
          organizationId: member.organizationId,
          publisherMemberId: { not: null },
          publisherEmailAccountId: { not: null },
        },
      },
      ...(input.before
        ? {
            OR: [
              { createdAt: { lt: input.before.createdAt } },
              {
                createdAt: input.before.createdAt,
                id: { lt: input.before.id },
              },
            ],
          }
        : {}),
    },
    include: {
      participant: {
        select: { muted: true, readRevision: true, generation: true },
      },
      conversation: { select: { generation: true, revision: true } },
      comment: { select: { body: true, deletedAt: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(input.limit, 100),
  });
  const currentGrants = await prisma.conversationParticipant.findMany({
    where: {
      memberId: member.id,
      active: true,
      conversationId: { in: page.map((item) => item.conversationId) },
      conversation: {
        status: "ACTIVE",
        organizationId: member.organizationId,
        publisherMemberId: { not: null },
        publisherEmailAccountId: { not: null },
      },
    },
    select: {
      id: true,
      generation: true,
      conversation: { select: { generation: true } },
    },
  });
  const authorizedGrantIds = new Set(
    currentGrants
      .filter((grant) => grant.generation === grant.conversation.generation)
      .map((grant) => grant.id),
  );
  return {
    items: page
      .filter(
        (item) =>
          item.participant.generation === item.conversation.generation &&
          authorizedGrantIds.has(item.participantId),
      )
      .map((item) => ({
        id: item.id,
        conversationId: item.conversationId,
        kind: item.kind,
        createdAt: item.createdAt,
        preview: item.comment?.deletedAt
          ? null
          : (item.comment?.body.slice(0, 160) ?? null),
        unread:
          !item.participant.muted &&
          item.revision > item.participant.readRevision,
        muted: item.participant.muted,
      })),
    nextCursor:
      page.length === input.limit
        ? {
            createdAt: page.at(-1)!.createdAt,
            id: page.at(-1)!.id,
          }
        : null,
  };
}
