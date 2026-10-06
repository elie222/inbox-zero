import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { SafeError } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import {
  getAuthorizedConversation,
  getOwnedMember,
  getPublisherConversation,
  type ConversationActor,
} from "@/utils/team-comments/access";
import { publishConversationChange } from "@/utils/team-comments/events";

export async function getSharedConversation(
  actor: ConversationActor,
  conversationId: string,
) {
  const { conversation, participant } = await getAuthorizedConversation(
    actor,
    conversationId,
  );
  const canManage = conversation.publisherId === actor.memberId;
  const availableTeammates = canManage
    ? await prisma.member.findMany({
        where: {
          organizationId: conversation.organizationId,
          id: { not: actor.memberId },
        },
        select: {
          id: true,
          emailAccount: { select: { email: true, name: true } },
        },
      })
    : [];
  return {
    id: conversation.id,
    generation: conversation.generation,
    revision: conversation.revision,
    participants: conversation.participants
      .filter((entry) => entry.generation === conversation.generation)
      .map((entry) => ({
        memberId: entry.memberId,
        name: entry.member.emailAccount.name ?? entry.member.emailAccount.email,
        image: entry.member.emailAccount.image,
      })),
    capabilities: { manage: canManage, comment: true },
    availableTeammates: availableTeammates.map((teammate) => ({
      memberId: teammate.id,
      name: teammate.emailAccount.name ?? teammate.emailAccount.email,
    })),
    readRevision: participant.readRevision,
    muted: participant.muted,
    commentCount: await prisma.conversationComment.count({
      where: { conversationId, deletedAt: null },
    }),
  };
}

export async function listSharedConversations(actor: ConversationActor) {
  const member = await getOwnedMember(actor);
  const rows = await prisma.sharedConversation.findMany({
    where: {
      organizationId: member.organizationId,
      status: "ACTIVE",
      participants: { some: { memberId: member.id, active: true } },
    },
    include: {
      participants: { where: { memberId: member.id, active: true } },
      publisher: {
        select: { emailAccount: { select: { name: true, email: true } } },
      },
      comments: {
        where: { deletedAt: null },
        orderBy: { revision: "desc" },
        take: 1,
        select: { revision: true },
      },
      _count: { select: { comments: { where: { deletedAt: null } } } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  return rows.flatMap((row) => {
    const participant = row.participants.find(
      (entry) => entry.generation === row.generation,
    );
    if (!participant) return [];
    return [
      {
        id: row.id,
        publisher:
          row.publisher.emailAccount.name ?? row.publisher.emailAccount.email,
        commentCount: row._count.comments,
        unread:
          !participant.muted &&
          (row.comments[0]?.revision ?? 0) > participant.readRevision,
        muted: participant.muted,
        updatedAt: row.updatedAt,
      },
    ];
  });
}

export async function getShareForSource(
  actor: ConversationActor,
  source: {
    emailAccountId: string;
    threadId: string;
  },
) {
  const member = await getOwnedMember(actor);
  if (member.emailAccountId !== source.emailAccountId)
    throw new SafeError(
      "The selected account is not this membership's account",
    );
  const conversation = await prisma.sharedConversation.findUnique({
    where: {
      publisherId_threadId: {
        publisherId: member.id,
        threadId: source.threadId,
      },
    },
  });
  if (conversation?.status !== "ACTIVE") return null;
  return getSharedConversation(actor, conversation.id);
}

export async function shareConversation(
  actor: ConversationActor,
  input: {
    source: { emailAccountId: string; threadId: string };
    participantMemberIds: string[];
    logger: Logger;
  },
) {
  const member = await getOwnedMember(actor);
  if (member.emailAccountId !== input.source.emailAccountId)
    throw new SafeError(
      "The selected account is not this membership's account",
    );
  const selected = [...new Set(input.participantMemberIds)]
    .filter((id) => id !== member.id)
    .sort();
  if (!selected.length) throw new SafeError("Select at least one teammate");
  if (selected.length > 20) throw new SafeError("Too many teammates selected");
  const existing = await prisma.sharedConversation.findUnique({
    where: {
      publisherId_threadId: {
        publisherId: member.id,
        threadId: input.source.threadId,
      },
    },
  });
  if (existing?.status === "ACTIVE")
    return getSharedConversation(actor, existing.id);
  if (existing)
    return restartSharing(actor, existing.id, selected, input.logger);

  const account = await prisma.emailAccount.findFirst({
    where: { id: member.emailAccountId, userId: actor.userId },
    select: { account: { select: { provider: true } } },
  });
  if (!account) throw new SafeError("Account unavailable");
  const provider = await createEmailProvider({
    emailAccountId: member.emailAccountId,
    provider: account.account.provider,
    logger: input.logger,
  });
  const thread = await provider.getThread(input.source.threadId, {
    complete: true,
  });
  if (!thread.messages.length) throw new SafeError("Conversation unavailable");

  const conversationId = randomUUID();
  const participantIds = [member.id, ...selected];
  const grantRows = participantIds.map((memberId) => ({
    id: randomUUID(),
    conversationId,
    memberId,
    generation: 1,
  }));
  const publisherGrant = grantRows[0];
  const selectedSql = Prisma.join(participantIds);
  try {
    await retryConflicts(async () => {
      await prisma.$transaction(
        [
          prisma.$executeRaw`
        INSERT INTO "SharedConversation" (
          "id", "updatedAt", "organizationId", "publisherId", "threadId", "revision"
        )
        SELECT ${conversationId}, CURRENT_TIMESTAMP, ${member.organizationId},
          ${member.id}, ${input.source.threadId}, 1
        WHERE (SELECT COUNT(*) FROM "Member" m
          JOIN "EmailAccount" a ON a."id" = m."emailAccountId"
          WHERE m."id" IN (${selectedSql}) AND m."organizationId" = ${member.organizationId}) = ${participantIds.length}
          AND EXISTS (SELECT 1 FROM "Member" m JOIN "EmailAccount" a ON a."id" = m."emailAccountId"
            WHERE m."id" = ${member.id} AND a."userId" = ${actor.userId}
              AND m."emailAccountId" = ${member.emailAccountId})
      `,
          prisma.conversationParticipant.createMany({ data: grantRows }),
          prisma.conversationActivity.createMany({
            data: grantRows
              .filter((grant) => grant.id !== publisherGrant.id)
              .map((grant) => ({
                id: randomUUID(),
                participantId: grant.id,
                kind: "INVITED",
                revision: 1,
              })),
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const rawSqlState = (
        error.meta as
          | {
              driverAdapterError?: {
                cause?: { originalCode?: string };
              };
            }
          | undefined
      )?.driverAdapterError?.cause?.originalCode;
      if (
        error.code === "P2003" ||
        (error.code === "P2010" && rawSqlState === "23503")
      )
        throw new SafeError("Teammate is no longer a member");
      if (
        error.code === "P2002" ||
        (error.code === "P2010" && rawSqlState === "23505")
      ) {
        const committed = await prisma.sharedConversation.findUnique({
          where: {
            publisherId_threadId: {
              publisherId: member.id,
              threadId: input.source.threadId,
            },
          },
        });
        if (committed?.status === "ACTIVE")
          return getSharedConversation(actor, committed.id);
      }
    }
    throw error;
  }
  await publishConversationChange(conversationId, input.logger);
  return getSharedConversation(actor, conversationId);
}

export async function stopSharing(
  actor: ConversationActor,
  conversationId: string,
  logger: Logger,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const member = await getOwnedMember(actor);
    const conversation = await prisma.sharedConversation.findFirst({
      where: {
        id: conversationId,
        organizationId: member.organizationId,
        publisherId: member.id,
      },
    });
    if (!conversation) throw new SafeError("Conversation access unavailable");
    if (conversation.status === "STOPPED") return { stopped: true };
    await getPublisherConversation(actor, conversationId);
    try {
      await prisma.$transaction(
        [
          prisma.sharedConversation.update({
            where: {
              id: conversationId,
              revision: conversation.revision,
              generation: conversation.generation,
              status: "ACTIVE",
              publisherId: actor.memberId,
            },
            data: { status: "STOPPED", revision: { increment: 1 } },
          }),
          prisma.conversationParticipant.updateMany({
            where: { conversationId, generation: conversation.generation },
            data: { active: false },
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await publishConversationChange(conversationId, logger);
      return { stopped: true };
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

async function restartSharing(
  actor: ConversationActor,
  conversationId: string,
  selected: string[],
  logger: Logger,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const member = await getOwnedMember(actor);
    const conversation = await prisma.sharedConversation.findFirst({
      where: {
        id: conversationId,
        organizationId: member.organizationId,
        publisherId: member.id,
      },
    });
    if (!conversation) throw new SafeError("Conversation cannot be restarted");
    if (conversation.status === "ACTIVE")
      return getSharedConversation(actor, conversationId);
    const generation = conversation.generation + 1;
    const participantIds = [member.id, ...selected];
    const grants = participantIds.map((memberId) => ({
      id: randomUUID(),
      conversationId,
      memberId,
      generation,
    }));
    try {
      await prisma.$transaction(
        [
          prisma.$queryRaw`SELECT 1 / CASE WHEN (
          SELECT COUNT(*) FROM "Member" WHERE "id" IN (${Prisma.join(participantIds)})
            AND "organizationId" = ${member.organizationId}
          ) = ${participantIds.length} THEN 1 ELSE 0 END`,
          prisma.sharedConversation.update({
            where: {
              id: conversationId,
              status: "STOPPED",
              revision: conversation.revision,
              generation: conversation.generation,
              publisherId: member.id,
            },
            data: { status: "ACTIVE", generation, revision: { increment: 1 } },
          }),
          prisma.conversationParticipant.createMany({ data: grants }),
          prisma.conversationActivity.createMany({
            data: grants.slice(1).map((grant) => ({
              id: randomUUID(),
              participantId: grant.id,
              kind: "INVITED",
              revision: conversation.revision + 1,
            })),
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await publishConversationChange(conversationId, logger);
      return getSharedConversation(actor, conversationId);
    } catch (error) {
      const sqlState =
        error instanceof Prisma.PrismaClientKnownRequestError
          ? (
              error.meta as
                | {
                    driverAdapterError?: {
                      cause?: { originalCode?: string };
                    };
                  }
                | undefined
            )?.driverAdapterError?.cause?.originalCode
          : undefined;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2010" &&
        sqlState === "22012"
      )
        throw new SafeError("Teammate is no longer a member");
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

export async function setParticipantAccess(
  actor: ConversationActor,
  input: {
    conversationId: string;
    memberId: string;
    access: boolean;
    logger: Logger;
  },
) {
  if (input.memberId === actor.memberId)
    throw new SafeError("The publisher cannot be removed");
  for (let attempt = 0; attempt < 4; attempt++) {
    const { conversation } = await getPublisherConversation(
      actor,
      input.conversationId,
    );
    const member = await prisma.member.findFirst({
      where: {
        id: input.memberId,
        organizationId: conversation.organizationId,
      },
      select: { id: true },
    });
    if (!member && input.access)
      throw new SafeError("Teammate is no longer a member");
    if (!member) return getSharedConversation(actor, input.conversationId);
    const oldGrant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_memberId_generation: {
          conversationId: input.conversationId,
          memberId: input.memberId,
          generation: conversation.generation,
        },
      },
    });
    if (Boolean(oldGrant?.active) === input.access)
      return getSharedConversation(actor, input.conversationId);
    const grantId = oldGrant?.id ?? randomUUID();
    try {
      await prisma.$transaction(
        [
          prisma.sharedConversation.update({
            where: {
              id: input.conversationId,
              status: "ACTIVE",
              revision: conversation.revision,
              generation: conversation.generation,
              publisherId: actor.memberId,
            },
            data: { revision: { increment: 1 } },
          }),
          oldGrant
            ? prisma.conversationParticipant.update({
                where: {
                  id: oldGrant.id,
                  memberId: input.memberId,
                  active: !input.access,
                },
                data: { active: input.access },
              })
            : prisma.conversationParticipant.create({
                data: {
                  id: grantId,
                  conversationId: input.conversationId,
                  memberId: input.memberId,
                  generation: conversation.generation,
                },
              }),
          prisma.conversationActivity.createMany({
            data: input.access
              ? [
                  {
                    id: randomUUID(),
                    participantId: grantId,
                    kind: "INVITED",
                    revision: conversation.revision + 1,
                  },
                ]
              : [],
          }),
        ],
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      await publishConversationChange(input.conversationId, input.logger);
      return getSharedConversation(actor, input.conversationId);
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

export async function retryConflicts<T>(
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !["P2034", "P2025"].includes(error.code) ||
        attempt === 2
      )
        throw error;
    }
  }
  throw new Error("Unreachable transaction state");
}
