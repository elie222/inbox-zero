import prisma from "@/utils/prisma";

export async function getSenders({
  emailAccountId,
  offset = 0,
  limit = 100,
}: {
  emailAccountId: string;
  offset?: number;
  limit?: number;
}) {
  return prisma.emailMessage.findMany({
    where: {
      emailAccountId,
      sent: false,
    },
    select: {
      from: true,
    },
    distinct: ["from"],
    skip: offset,
    take: limit,
  });
}
