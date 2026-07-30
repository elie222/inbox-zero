import { DigestStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

export async function claimPendingDigestIds({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const claimedDigests = await prisma.digest.updateManyAndReturn({
    where: {
      emailAccountId,
      status: DigestStatus.PENDING,
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
