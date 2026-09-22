import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import {
  getAuthorizedConversation,
  type ConversationActor,
} from "@/utils/team-comments/access";
import { hashMutation } from "@/utils/team-comments/conversations";
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
    include: {
      authorMember: {
        select: {
          emailAccount: { select: { name: true, email: true, image: true } },
        },
      },
    },
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
  const payloadHash = hashMutation({ body, mentionedMemberIds });
  for (let attempt = 0; attempt < 4; attempt++) {
    const { conversation } = await getAuthorizedConversation(
      actor,
      input.conversationId,
    );
    const receipt = await prisma.conversationMutationReceipt.findUnique({
      where: {
        conversationId_actorIdentityId_clientMutationId: {
          conversationId: input.conversationId,
          actorIdentityId: actor.memberId,
          clientMutationId: input.clientMutationId,
        },
      },
    });
    if (receipt) {
      if (
        receipt.payloadHash !== payloadHash ||
        receipt.resultKind !== "comment"
      )
        throw new SafeError("Mutation ID was reused with different content");
      const committed = await prisma.conversationComment.findUnique({
        where: { id: receipt.resultId },
        include: {
          authorMember: {
            select: {
              emailAccount: {
                select: { name: true, email: true, image: true },
              },
            },
          },
        },
      });
      if (!committed) throw new SafeError("Comment unavailable");
      return toCommentDto(committed);
    }
    const activeParticipants = conversation.participants.filter(
      (entry) =>
        entry.active &&
        entry.generation === conversation.generation &&
        entry.member,
    );
    if (
      mentionedMemberIds.some(
        (id) =>
          !activeParticipants.some((entry) => entry.memberIdentityId === id),
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
              publisherMemberId: { not: null },
              publisherEmailAccountId: { not: null },
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
              authorUserId: actor.userId,
              authorMemberId: actor.memberId,
              authorIdentityId: actor.memberId,
              body,
              mentionedMemberIdentityIds: mentionedMemberIds,
              revision,
              generation: conversation.generation,
            },
          }),
          prisma.conversationMutationReceipt.create({
            data: {
              id: randomUUID(),
              conversationId: conversation.id,
              actorIdentityId: actor.memberId,
              clientMutationId: input.clientMutationId,
              payloadHash,
              resultKind: "comment",
              resultId: commentId,
              generation: conversation.generation,
            },
          }),
          prisma.conversationActivity.createMany({
            data: activeParticipants
              .filter((participant) => participant.memberId !== actor.memberId)
              .map((participant) => ({
                id: randomUUID(),
                conversationId: conversation.id,
                participantId: participant.id,
                commentId,
                kind: mentionedMemberIds.includes(participant.memberIdentityId)
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
        include: {
          authorMember: {
            select: {
              emailAccount: {
                select: { name: true, email: true, image: true },
              },
            },
          },
        },
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
    clientMutationId: string;
    logger: Logger;
  },
) {
  const payloadHash = hashMutation({
    operation: "delete",
    commentId: input.commentId,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const { conversation } = await getAuthorizedConversation(
      actor,
      input.conversationId,
    );
    const receipt = await prisma.conversationMutationReceipt.findUnique({
      where: {
        conversationId_actorIdentityId_clientMutationId: {
          conversationId: input.conversationId,
          actorIdentityId: actor.memberId,
          clientMutationId: input.clientMutationId,
        },
      },
    });
    if (receipt) {
      if (
        receipt.payloadHash !== payloadHash ||
        receipt.resultKind !== "delete"
      )
        throw new SafeError("Mutation ID was reused with different content");
      return { id: receipt.resultId, deleted: true };
    }
    const comment = await prisma.conversationComment.findFirst({
      where: {
        id: input.commentId,
        conversationId: input.conversationId,
        authorMemberId: actor.memberId,
        authorUserId: actor.userId,
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
            data: {
              body: "",
              mentionedMemberIdentityIds: [],
              deletedAt: new Date(),
            },
          }),
          prisma.conversationMutationReceipt.create({
            data: {
              id: randomUUID(),
              conversationId: conversation.id,
              actorIdentityId: actor.memberId,
              clientMutationId: input.clientMutationId,
              payloadHash,
              resultKind: "delete",
              resultId: comment.id,
              generation: conversation.generation,
            },
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

function toCommentDto(comment: {
  id: string;
  revision: number;
  body: string;
  deletedAt: Date | null;
  createdAt: Date;
  authorIdentityId: string;
  mentionedMemberIdentityIds: string[];
  authorMember: {
    emailAccount: { name: string | null; email: string; image: string | null };
  } | null;
}) {
  return {
    id: comment.id,
    revision: comment.revision,
    body: comment.deletedAt ? null : comment.body,
    deleted: Boolean(comment.deletedAt),
    createdAt: comment.createdAt,
    author: comment.authorMember
      ? {
          memberId: comment.authorIdentityId,
          name:
            comment.authorMember.emailAccount.name ??
            comment.authorMember.emailAccount.email,
          image: comment.authorMember.emailAccount.image,
        }
      : {
          memberId: comment.authorIdentityId,
          name: "Former member",
          image: null,
        },
    mentionedMemberIds: comment.deletedAt
      ? []
      : comment.mentionedMemberIdentityIds,
  };
}
