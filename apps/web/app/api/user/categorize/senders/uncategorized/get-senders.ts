import prisma from "@/utils/prisma";

export async function getSenders({
  userId,
  offset = 0,
  limit = 100,
}: {
  userId: string;
  offset?: number;
  limit?: number;
}) {
  return prisma.emailMessage.findMany({
    where: {
      userId,
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
