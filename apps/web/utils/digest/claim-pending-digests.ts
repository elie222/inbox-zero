import { Prisma } from "@/generated/prisma/client";
import { DigestStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

const PROCESSING_LEASE_MS = 10 * 60 * 1000;

export type DigestClaim = {
  digestIds: string[];
  claimedAt: Date;
};

export async function claimPendingDigests({
  emailAccountId,
  now = new Date(),
}: {
  emailAccountId: string;
  now?: Date;
}): Promise<DigestClaim> {
  const claimedDigests = await prisma.digest.updateManyAndReturn({
    where: {
      emailAccountId,
      OR: [
        { status: DigestStatus.PENDING },
        {
          status: DigestStatus.PROCESSING,
          updatedAt: {
            lt: new Date(now.getTime() - PROCESSING_LEASE_MS),
          },
        },
      ],
    },
    data: {
      status: DigestStatus.PROCESSING,
      updatedAt: now,
    },
    select: {
      id: true,
    },
  });

  return {
    digestIds: claimedDigests.map((digest) => digest.id),
    claimedAt: now,
  };
}

export async function renewDigestClaim(
  claim: DigestClaim,
  now = new Date(),
): Promise<DigestClaim | null> {
  if (claim.digestIds.length === 0) return null;

  const renewedDigests = await prisma.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      WITH "ownedClaims" AS MATERIALIZED (
        SELECT "id"
        FROM "Digest"
        WHERE
          "id" IN (${Prisma.join(claim.digestIds)})
          AND "status" = ${DigestStatus.PROCESSING}
          AND "updatedAt" = ${claim.claimedAt}
        FOR UPDATE
      ),
      "completeClaim" AS (
        SELECT COUNT(*) = ${claim.digestIds.length} AS "isComplete"
        FROM "ownedClaims"
      )
      UPDATE "Digest"
      SET "updatedAt" = ${now}
      WHERE
        "id" IN (SELECT "id" FROM "ownedClaims")
        AND (SELECT "isComplete" FROM "completeClaim")
      RETURNING "id"
    `,
  );

  if (renewedDigests.length !== claim.digestIds.length) return null;

  return {
    digestIds: claim.digestIds,
    claimedAt: now,
  };
}

export function getDigestClaimWhere(claim: DigestClaim) {
  return {
    id: {
      in: claim.digestIds,
    },
    status: DigestStatus.PROCESSING,
    updatedAt: claim.claimedAt,
  };
}
