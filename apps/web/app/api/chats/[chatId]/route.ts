import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { ChatType } from "@/generated/prisma/client";

export type GetChatResponse = Awaited<ReturnType<typeof getChat>>;

export const GET = withEmailAccount(
  "chats/detail",
  async (request, { params }) => {
    const { emailAccountId } = request.auth;
    const { chatId } = await params;

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required." },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(request.url);
    const type = parseChatType(searchParams.get("type"));
    const chat = await getChat({ chatId, emailAccountId, type });

    return NextResponse.json(chat);
  },
);

async function getChat({
  chatId,
  emailAccountId,
  type,
}: {
  chatId: string;
  emailAccountId: string;
  type: ChatType;
}) {
  const chat = await prisma.chat.findUnique({
    where: {
      id: chatId,
      emailAccountId,
      type,
    },
    include: {
      messages: {
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  return chat;
}

function parseChatType(value: string | null): ChatType {
  if (value === ChatType.AGENT) return ChatType.AGENT;
  return ChatType.RULES;
}
