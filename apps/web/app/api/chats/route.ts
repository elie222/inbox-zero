import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { ChatType } from "@/generated/prisma/client";

export type GetChatsResponse = Awaited<ReturnType<typeof getChats>>;

export const GET = withEmailAccount("chats", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getChats({ emailAccountId });
  return NextResponse.json(result);
});

async function getChats({ emailAccountId }: { emailAccountId: string }) {
  const chats = await prisma.chat.findMany({
    where: { emailAccountId, type: ChatType.RULES },
    orderBy: { updatedAt: "desc" },
  });

  return { chats };
}
