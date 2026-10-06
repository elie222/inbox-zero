import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import {
  getAuthorizedConversation,
  type ConversationActor,
} from "@/utils/team-comments/access";
import { publishConversationChange } from "@/utils/team-comments/events";
import type { Logger } from "@/utils/logger";

export async function getComments(
  actor: ConversationActor,
  input: {
    conversationId: string;
    beforeRevision?: number;
    limit: number;
  },
) {
  const { conversation } = await getAuthorizedConversation(
    actor,
    input.conversationId,
  );
  const rows = await prisma.conversationComment.findMany({
    where: {
      conversationId: conversation.id,
      ...(input.beforeRevision
        ? { revision: { lt: input.beforeRevision } }
        : {}),
    },
    orderBy: { revision: "desc" },
    take: Math.min(input.limit, 100),
    include: commentAuthorInclude,
  });
  await getAuthorizedConversation(actor, input.conversationId);
  return {
    comments: rows.toReversed().map(toCommentDto),
    revision: conversation.revision,
    nextCursor:
      rows.length === input.limit ? (rows.at(-1)?.revision ?? null) : null,
  };
}

export async function postComment(
  actor: ConversationActor,
  input: {
    conversationId: string;
    body: string;
    mentionedMemberIds: string[];
    clientMutationId: string;
    logger: Logger;
  },
) {
  const body = input.body.trim();
  if (!body || body.length > 10_000)
    throw new SafeError("Comment must be 1–10,000 characters");
  const mentionedMemberIds = [...new Set(input.mentionedMemberIds)].sort();
  if (mentionedMemberIds.length > 20) throw new SafeError("Too many mentions");
  for (let attempt = 0; attempt < 4; attempt++) {
    const { conversation } = await getAuthorizedConversation(
      actor,
      input.conversationId,
    );
    const existing = await prisma.conversationComment.findUnique({
      where: {
        conversationId_authorMemberId_clientMutationId: {
          conversationId: input.conversationId,
          authorMemberId: actor.memberId,
          clientMutationId: input.clientMutationId,
        },
      },
      include: commentAuthorInclude,
    });
    if (existing) {
      if (!existing.deletedAt && existing.body !== body)
        throw new SafeError("Mutation ID was reused with different content");
      return toCommentDto(existing);
    }
    const activeParticipants = conversation.participants.filter(
      (entry) => entry.active && entry.generation === conversation.generation,
    );
    if (
      mentionedMemberIds.some(
        (id) => !activeParticipants.some((entry) => entry.memberId === id),
      )
    )
      throw new SafeError("Mentions must refer to current participants");

    const commentId = randomUUID();
    const revision = conversation.revision + 1;
    try {
      await prisma.$transaction(
        [
          prisma.sharedConversation.update({
            where: {
              id: conversation.id,
              status: "ACTIVE",
              revision: conversation.revision,
              generation: conversation.generation,
              participants: {
                some: {
                  memberId: actor.memberId,
                  generation: conversation.generation,
                  active: true,
                  member: { emailAccount: { userId: actor.userId } },
                },
              },
            },
            data: { revision: { increment: 1 } },
          }),
          prisma.conversationComment.create({
            data: {
              id: commentId,
              conversationId: conversation.id,
              authorMemberId: actor.memberId,
              clientMutationId: input.clientMutationId,
              body,
              revision,
            },
          }),
          prisma.conversationActivity.createMany({
            data: activeParticipants
              .filter((participant) => participant.memberId !== actor.memberId)
              .map((participant) => ({
                id: randomUUID(),
                participantId: participant.id,
                commentId,
                kind: mentionedMemberIds.includes(participant.memberId)
                  ? ("MENTION" as const)
                  : ("COMMENT" as const),
                revision,
              })),
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await publishConversationChange(conversation.id, input.logger);
      const committed = await prisma.conversationComment.findUniqueOrThrow({
        where: { id: commentId },
        include: commentAuthorInclude,
      });
      return toCommentDto(committed);
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !["P2002", "P2025", "P2034"].includes(error.code) ||
        attempt === 3
      )
        throw error;
    }
  }
  throw new Error("Unreachable transaction state");
}

export async function deleteComment(
  actor: ConversationActor,
  input: {
    conversationId: string;
    commentId: string;
    logger: Logger;
  },
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { conversation } = await getAuthorizedConversation(
      actor,
      input.conversationId,
    );
    const comment = await prisma.conversationComment.findFirst({
      where: {
        id: input.commentId,
        conversationId: input.conversationId,
        authorMemberId: actor.memberId,
      },
    });
    if (!comment)
      throw new SafeError("Only the author can delete this comment");
    if (comment.deletedAt) return { id: comment.id, deleted: true };
    try {
      await prisma.$transaction(
        [
          prisma.sharedConversation.update({
            where: {
              id: conversation.id,
              status: "ACTIVE",
              revision: conversation.revision,
              generation: conversation.generation,
              participants: {
                some: {
                  memberId: actor.memberId,
                  generation: conversation.generation,
                  active: true,
                  member: { emailAccount: { userId: actor.userId } },
                },
              },
            },
            data: { revision: { increment: 1 } },
          }),
          prisma.conversationComment.update({
            where: {
              id: comment.id,
              deletedAt: null,
              authorMemberId: actor.memberId,
            },
            data: { body: "", deletedAt: new Date() },
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await publishConversationChange(conversation.id, input.logger);
      return { id: comment.id, deleted: true };
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !["P2002", "P2025", "P2034"].includes(error.code) ||
        attempt === 3
      )
        throw error;
    }
  }
  throw new Error("Unreachable transaction state");
}

const commentAuthorInclude = {
  author: {
    select: {
      emailAccount: { select: { name: true, email: true, image: true } },
    },
  },
} satisfies Prisma.ConversationCommentInclude;

function toCommentDto(
  comment: Prisma.ConversationCommentGetPayload<{
    include: typeof commentAuthorInclude;
  }>,
) {
  return {
    id: comment.id,
    revision: comment.revision,
    body: comment.deletedAt ? null : comment.body,
    deleted: Boolean(comment.deletedAt),
    createdAt: comment.createdAt,
    author: comment.author
      ? {
          memberId: comment.authorMemberId,
          name:
            comment.author.emailAccount.name ??
            comment.author.emailAccount.email,
          image: comment.author.emailAccount.image,
        }
      : { memberId: null, name: "Former member", image: null },
  };
}
