import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type DebugMemoriesResponse = Awaited<
  ReturnType<typeof getMemoriesDebugData>
>;

export const GET = withEmailAccount("user/debug/memories", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getMemoriesDebugData({ emailAccountId });
  return NextResponse.json(result);
});

async function getMemoriesDebugData({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const [memories, totalCount] = await Promise.all([
    prisma.chatMemory.findMany({
      where: { emailAccountId },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        chatId: true,
      },
    }),
    prisma.chatMemory.count({ where: { emailAccountId } }),
  ]);

  return { memories, totalCount };
}
