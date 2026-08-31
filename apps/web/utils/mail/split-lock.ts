import prisma from "@/utils/prisma";

export function lockMailSplits(emailAccountId: string) {
  return prisma.$queryRaw`
    SELECT true AS locked
    FROM (
      SELECT pg_advisory_xact_lock(742931, hashtext(${emailAccountId}))
    ) lock
  `;
}
