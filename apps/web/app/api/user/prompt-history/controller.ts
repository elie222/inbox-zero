import prisma from "@/utils/prisma";

export type PromptHistoryResponse = Awaited<
  ReturnType<typeof getPromptHistory>
>;

export async function getPromptHistory(options: { userId: string }) {
  const history = await prisma.promptHistory.findMany({
    where: {
      userId: options.userId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
  return { history };
}

export async function deletePromptHistory(options: {
  id: string;
  userId: string;
}) {
  const { id, userId } = options;

  return await prisma.promptHistory.delete({ where: { id, userId } });
}
