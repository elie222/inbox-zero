import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

export type ConversationActor = {
  userId: string;
  memberId: string;
};

export async function getOwnedMember(actor: ConversationActor) {
  const member = await prisma.member.findFirst({
    where: {
      id: actor.memberId,
      emailAccount: { userId: actor.userId },
    },
    select: {
      id: true,
      organizationId: true,
      emailAccountId: true,
      emailAccount: { select: { email: true, name: true, image: true } },
    },
  });
  if (!member) throw new SafeError("Conversation access unavailable");
  return member;
}

export async function getAuthorizedConversation(
  actor: ConversationActor,
  conversationId: string,
) {
  const member = await getOwnedMember(actor);
  const conversation = await prisma.sharedConversation.findFirst({
    where: {
      id: conversationId,
      organizationId: member.organizationId,
      status: "ACTIVE",
      publisherMemberId: { not: null },
      publisherEmailAccountId: { not: null },
      participants: {
        some: {
          memberId: member.id,
          active: true,
        },
      },
    },
    include: {
      participants: {
        where: { active: true },
        include: {
          member: {
            select: {
              id: true,
              emailAccount: {
                select: { email: true, name: true, image: true },
              },
            },
          },
        },
      },
      publisherMember: {
        select: {
          id: true,
          emailAccount: { select: { name: true, email: true } },
        },
      },
      publisherEmailAccount: {
        select: {
          id: true,
          account: { select: { provider: true, disconnectedAt: true } },
        },
      },
    },
  });
  if (!conversation) throw new SafeError("Conversation access unavailable");
  const participant = conversation.participants.find(
    (entry) =>
      entry.memberId === member.id &&
      entry.generation === conversation.generation,
  );
  if (!participant) throw new SafeError("Conversation access unavailable");
  return { conversation, member, participant };
}

export async function getPublisherConversation(
  actor: ConversationActor,
  conversationId: string,
) {
  const access = await getAuthorizedConversation(actor, conversationId);
  if (access.conversation.publisherMemberId !== actor.memberId)
    throw new SafeError("Only the publisher can manage sharing");
  return access;
}
