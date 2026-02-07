import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { ChatType } from "@/generated/prisma/client";

export type GetChatsResponse = Awaited<ReturnType<typeof getChats>>;

export const GET = withEmailAccount("chats", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const { searchParams } = new URL(request.url);
  const type = parseChatType(searchParams.get("type"));
  const result = await getChats({ emailAccountId, type });
  return NextResponse.json(result);
});

async function getChats({
  emailAccountId,
  type,
}: {
  emailAccountId: string;
  type: ChatType;
}) {
  const chats = await prisma.chat.findMany({
    where: { emailAccountId, type },
    orderBy: { updatedAt: "desc" },
  });

  return { chats };
}

function parseChatType(value: string | null): ChatType {
  if (value === ChatType.AGENT) return ChatType.AGENT;
  return ChatType.RULES;
}
