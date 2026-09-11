import { DigestStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

export async function getDigestDeliveryState({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const [queuedItemCount, lastDigest] = await Promise.all([
    prisma.digestItem.count({
      where: {
        digest: {
          emailAccountId,
          status: {
            in: [DigestStatus.PENDING, DigestStatus.PROCESSING],
          },
        },
      },
    }),
    prisma.digest.findFirst({
      where: {
        emailAccountId,
        status: {
          in: [DigestStatus.SENT, DigestStatus.FAILED],
        },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        status: true,
        sentAt: true,
        updatedAt: true,
      },
    }),
  ]);

  return {
    queuedItemCount,
    lastDelivery: lastDigest
      ? {
          status: lastDigest.status,
          occurredAt: lastDigest.sentAt ?? lastDigest.updatedAt,
        }
      : null,
  };
}
