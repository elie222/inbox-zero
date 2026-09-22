import { createHash, randomUUID } from "node:crypto";
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
  const canManage = conversation.publisherMemberId === actor.memberId;
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
    publisher: {
      name: conversation.publisherMember?.emailAccount.name ?? "Former member",
      email: conversation.publisherMember?.emailAccount.email ?? null,
    },
    participants: conversation.participants
      .filter(
        (entry) => entry.generation === conversation.generation && entry.member,
      )
      .map((entry) => ({
        memberId: entry.memberIdentityId,
        name:
          entry.member!.emailAccount.name ?? entry.member!.emailAccount.email,
        image: entry.member!.emailAccount.image,
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
      publisherMemberId: { not: null },
      publisherEmailAccountId: { not: null },
      participants: { some: { memberId: member.id, active: true } },
    },
    include: {
      participants: { where: { memberId: member.id, active: true } },
      publisherMember: {
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
          row.publisherMember?.emailAccount.name ??
          row.publisherMember?.emailAccount.email ??
          "Former member",
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
    providerConversationId: string;
  },
) {
  const member = await getOwnedMember(actor);
  if (member.emailAccountId !== source.emailAccountId)
    throw new SafeError(
      "The selected account is not this membership's account",
    );
  const conversation = await prisma.sharedConversation.findUnique({
    where: {
      organizationId_publisherAccountIdentityId_providerConversationId: {
        organizationId: member.organizationId,
        publisherAccountIdentityId: source.emailAccountId,
        providerConversationId: source.providerConversationId,
      },
    },
  });
  if (conversation?.status !== "ACTIVE") return null;
  if (conversation.publisherMemberId !== member.id) return null;
  return getSharedConversation(actor, conversation.id);
}

export async function shareConversation(
  actor: ConversationActor,
  input: {
    source: { emailAccountId: string; providerConversationId: string };
    participantMemberIds: string[];
    clientMutationId: string;
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
  const payloadHash = hashMutation({ source: input.source, selected });
  const existing = await prisma.sharedConversation.findUnique({
    where: {
      organizationId_publisherAccountIdentityId_providerConversationId: {
        organizationId: member.organizationId,
        publisherAccountIdentityId: member.emailAccountId,
        providerConversationId: input.source.providerConversationId,
      },
    },
  });
  if (existing) {
    const receipt = await prisma.conversationMutationReceipt.findUnique({
      where: {
        conversationId_actorIdentityId_clientMutationId: {
          conversationId: existing.id,
          actorIdentityId: member.id,
          clientMutationId: input.clientMutationId,
        },
      },
    });
    if (receipt) {
      if (receipt.payloadHash !== payloadHash)
        throw new SafeError("Mutation ID was reused with different content");
      return getSharedConversation(actor, existing.id);
    }
    if (existing.status === "ACTIVE")
      throw new SafeError("This conversation is already shared");
    return restartSharing(
      actor,
      existing.id,
      selected,
      input.clientMutationId,
      payloadHash,
      input.logger,
    );
  }

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
  const thread = await provider.getThread(input.source.providerConversationId, {
    complete: true,
  });
  if (!thread.messages.length) throw new SafeError("Conversation unavailable");

  const conversationId = randomUUID();
  const participantIds = [member.id, ...selected];
  const grantRows = participantIds.map((memberId) => ({
    id: randomUUID(),
    conversationId,
    memberId,
    memberIdentityId: memberId,
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
          "id", "updatedAt", "organizationId", "publisherEmailAccountId",
          "publisherAccountIdentityId", "publisherMemberId", "providerConversationId", "revision"
        )
        SELECT ${conversationId}, CURRENT_TIMESTAMP, ${member.organizationId},
          ${member.emailAccountId}, ${member.emailAccountId}, ${member.id},
          ${input.source.providerConversationId}, 1
        WHERE (SELECT COUNT(*) FROM "Member" m
          JOIN "EmailAccount" a ON a."id" = m."emailAccountId"
          WHERE m."id" IN (${selectedSql}) AND m."organizationId" = ${member.organizationId}) = ${participantIds.length}
          AND EXISTS (SELECT 1 FROM "Member" m JOIN "EmailAccount" a ON a."id" = m."emailAccountId"
            WHERE m."id" = ${member.id} AND a."userId" = ${actor.userId}
              AND m."emailAccountId" = ${member.emailAccountId})
      `,
          prisma.conversationParticipant.createMany({ data: grantRows }),
          prisma.conversationMutationReceipt.create({
            data: {
              id: randomUUID(),
              conversationId,
              actorIdentityId: member.id,
              clientMutationId: input.clientMutationId,
              payloadHash,
              resultKind: "share",
              resultId: conversationId,
              generation: 1,
            },
          }),
          prisma.conversationActivity.createMany({
            data: grantRows
              .filter((grant) => grant.id !== publisherGrant.id)
              .map((grant) => ({
                id: randomUUID(),
                conversationId,
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
            organizationId_publisherAccountIdentityId_providerConversationId: {
              organizationId: member.organizationId,
              publisherAccountIdentityId: member.emailAccountId,
              providerConversationId: input.source.providerConversationId,
            },
          },
        });
        if (committed) {
          const receipt = await prisma.conversationMutationReceipt.findUnique({
            where: {
              conversationId_actorIdentityId_clientMutationId: {
                conversationId: committed.id,
                actorIdentityId: member.id,
                clientMutationId: input.clientMutationId,
              },
            },
          });
          if (receipt) {
            if (receipt.payloadHash !== payloadHash)
              throw new SafeError(
                "Mutation ID was reused with different content",
              );
            return getSharedConversation(actor, committed.id);
          }
          throw new SafeError("This conversation is already shared");
        }
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
  clientMutationId: string,
  logger: Logger,
) {
  const payloadHash = hashMutation({ operation: "stop" });
  for (let attempt = 0; attempt < 4; attempt++) {
    const member = await getOwnedMember(actor);
    const conversation = await prisma.sharedConversation.findFirst({
      where: {
        id: conversationId,
        organizationId: member.organizationId,
        publisherMemberId: member.id,
        publisherEmailAccountId: member.emailAccountId,
      },
    });
    if (!conversation) throw new SafeError("Conversation access unavailable");
    const receipt = await prisma.conversationMutationReceipt.findUnique({
      where: {
        conversationId_actorIdentityId_clientMutationId: {
          conversationId,
          actorIdentityId: actor.memberId,
          clientMutationId,
        },
      },
    });
    if (receipt) {
      if (receipt.payloadHash !== payloadHash || receipt.resultKind !== "stop")
        throw new SafeError("Mutation ID was reused with different content");
      if (conversation.generation !== receipt.generation)
        throw new SafeError("Sharing has changed since this operation");
      return { stopped: conversation.status === "STOPPED" };
    }
    if (conversation.status !== "ACTIVE")
      throw new SafeError("Conversation is already stopped");
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
              publisherMemberId: actor.memberId,
            },
            data: { status: "STOPPED", revision: { increment: 1 } },
          }),
          prisma.conversationParticipant.updateMany({
            where: { conversationId, generation: conversation.generation },
            data: { active: false },
          }),
          prisma.conversationMutationReceipt.create({
            data: {
              id: randomUUID(),
              conversationId,
              actorIdentityId: actor.memberId,
              clientMutationId,
              payloadHash,
              resultKind: "stop",
              resultId: conversationId,
              generation: conversation.generation,
            },
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
  clientMutationId: string,
  payloadHash: string,
  logger: Logger,
) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const member = await getOwnedMember(actor);
    const conversation = await prisma.sharedConversation.findFirst({
      where: {
        id: conversationId,
        organizationId: member.organizationId,
        publisherMemberId: member.id,
        publisherEmailAccountId: member.emailAccountId,
      },
    });
    if (!conversation) throw new SafeError("Conversation cannot be restarted");
    const receipt = await prisma.conversationMutationReceipt.findUnique({
      where: {
        conversationId_actorIdentityId_clientMutationId: {
          conversationId,
          actorIdentityId: member.id,
          clientMutationId,
        },
      },
    });
    if (receipt) {
      if (
        receipt.payloadHash !== payloadHash ||
        receipt.resultKind !== "restart"
      )
        throw new SafeError("Mutation ID was reused with different content");
      if (
        conversation.status !== "ACTIVE" ||
        conversation.generation !== receipt.generation
      )
        throw new SafeError("Sharing has changed since this operation");
      return getSharedConversation(actor, conversationId);
    }
    if (conversation.status !== "STOPPED")
      throw new SafeError("Conversation cannot be restarted");
    const generation = conversation.generation + 1;
    const participantIds = [member.id, ...selected];
    const grants = participantIds.map((memberId) => ({
      id: randomUUID(),
      conversationId,
      memberId,
      memberIdentityId: memberId,
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
              publisherMemberId: member.id,
            },
            data: { status: "ACTIVE", generation, revision: { increment: 1 } },
          }),
          prisma.conversationParticipant.createMany({ data: grants }),
          prisma.conversationMutationReceipt.create({
            data: {
              id: randomUUID(),
              conversationId,
              actorIdentityId: member.id,
              clientMutationId,
              payloadHash,
              resultKind: "restart",
              resultId: conversationId,
              generation,
            },
          }),
          prisma.conversationActivity.createMany({
            data: grants.slice(1).map((grant) => ({
              id: randomUUID(),
              conversationId,
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
    clientMutationId: string;
    logger: Logger;
  },
) {
  if (input.memberId === actor.memberId)
    throw new SafeError("The publisher cannot be removed");
  const payloadHash = hashMutation({
    memberId: input.memberId,
    access: input.access,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const { conversation } = await getPublisherConversation(
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
        receipt.resultKind !== "participant"
      )
        throw new SafeError("Mutation ID was reused with different content");
      if (receipt.generation !== conversation.generation)
        throw new SafeError("Sharing has changed since this operation");
      return getSharedConversation(actor, input.conversationId);
    }
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
        conversationId_memberIdentityId_generation: {
          conversationId: input.conversationId,
          memberIdentityId: input.memberId,
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
              publisherMemberId: actor.memberId,
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
                  memberIdentityId: input.memberId,
                  generation: conversation.generation,
                },
              }),
          prisma.conversationMutationReceipt.create({
            data: {
              id: randomUUID(),
              conversationId: input.conversationId,
              actorIdentityId: actor.memberId,
              clientMutationId: input.clientMutationId,
              payloadHash,
              resultKind: "participant",
              resultId: grantId,
              generation: conversation.generation,
            },
          }),
          prisma.conversationActivity.createMany({
            data: input.access
              ? [
                  {
                    id: randomUUID(),
                    conversationId: input.conversationId,
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

export function hashMutation(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
