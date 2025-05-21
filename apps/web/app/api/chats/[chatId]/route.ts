import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetChatResponse = Awaited<ReturnType<typeof getChat>>;

export const GET = withEmailAccount(async (request, { params }) => {
  const { emailAccountId } = request.auth;
  const { chatId } = await params;

  if (!chatId) {
    return NextResponse.json(
      { error: "Chat ID is required." },
      { status: 400 },
    );
  }

  const chat = await getChat({ chatId, emailAccountId });

  return NextResponse.json(chat);
});

async function getChat({
  chatId,
  emailAccountId,
}: {
  chatId: string;
  emailAccountId: string;
}) {
  const chat = await prisma.chat.findUnique({
    where: {
      id: chatId,
      emailAccountId,
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
