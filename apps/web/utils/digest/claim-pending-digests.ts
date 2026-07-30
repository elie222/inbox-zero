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
  const result = await prisma.digest.updateMany({
    where: getDigestClaimWhere(claim),
    data: {
      updatedAt: now,
    },
  });

  if (result.count !== claim.digestIds.length) return null;

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
