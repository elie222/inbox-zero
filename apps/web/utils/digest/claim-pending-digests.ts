import { DigestStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

const PROCESSING_LEASE_MS = 10 * 60 * 1000;

export async function claimPendingDigestIds({
  emailAccountId,
  now = new Date(),
}: {
  emailAccountId: string;
  now?: Date;
}) {
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
    },
    select: {
      id: true,
    },
  });

  return claimedDigests.map((digest) => digest.id);
}
