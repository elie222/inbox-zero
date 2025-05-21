import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetChatsResponse = Awaited<ReturnType<typeof getChats>>;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getChats({ emailAccountId });
  return NextResponse.json(result);
});

async function getChats({ emailAccountId }: { emailAccountId: string }) {
  const chats = await prisma.chat.findMany({
    where: { emailAccountId },
    orderBy: { updatedAt: "desc" },
  });

  return { chats };
}
