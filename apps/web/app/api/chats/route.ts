import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetChatsResponse = Awaited<ReturnType<typeof getChats>>;

export const GET = withEmailAccount("chats", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getChats({ emailAccountId });
  return NextResponse.json(result);
});

async function getChats({ emailAccountId }: { emailAccountId: string }) {
  const chats = await prisma.chat.findMany({
    where: { emailAccountId },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        where: { role: "user" },
        orderBy: { createdAt: "asc" },
        take: 1,
      },
    },
  });

  return {
    chats: chats.map((chat) => ({
      id: chat.id,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      preview: extractMessagePreview(chat.messages[0]?.parts),
    })),
  };
}

function extractMessagePreview(parts: unknown): string | null {
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    if (
      part &&
      typeof part === "object" &&
      "type" in part &&
      part.type === "text" &&
      "text" in part &&
      typeof part.text === "string"
    ) {
      return part.text.trim() || null;
    }
  }
  return null;
}
