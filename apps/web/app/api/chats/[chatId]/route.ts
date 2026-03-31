import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetChatResponse = Awaited<ReturnType<typeof getChat>>;
const updateChatSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
});

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

    const chat = await getChat({ chatId, emailAccountId });

    return NextResponse.json(chat);
  },
);

export const PATCH = withEmailAccount(
  "chats/update",
  async (request, { params }) => {
    const { emailAccountId } = request.auth;
    const { chatId } = await params;

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required." },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const { data, error } = updateChatSchema.safeParse(body);
    if (error) {
      return NextResponse.json({ error: error.errors }, { status: 400 });
    }

    if (data.name === undefined) {
      return NextResponse.json(
        { error: "At least one field must be provided." },
        { status: 400 },
      );
    }

    const updatedChat = await updateChat({
      chatId,
      emailAccountId,
      name: data.name,
    });

    if (!updatedChat) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    return NextResponse.json(updatedChat);
  },
);

export const DELETE = withEmailAccount(
  "chats/delete",
  async (request, { params }) => {
    const { emailAccountId } = request.auth;
    const { chatId } = await params;

    if (!chatId) {
      return NextResponse.json(
        { error: "Chat ID is required." },
        { status: 400 },
      );
    }

    const deleted = await deleteChat({ chatId, emailAccountId });
    if (!deleted) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  },
);

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

async function updateChat({
  chatId,
  emailAccountId,
  name,
}: {
  chatId: string;
  emailAccountId: string;
  name?: string;
}) {
  const result = await prisma.chat.updateMany({
    where: {
      id: chatId,
      emailAccountId,
    },
    data: {
      ...(name !== undefined ? { name } : {}),
    },
  });

  if (result.count === 0) return null;

  return prisma.chat.findUnique({
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
}

async function deleteChat({
  chatId,
  emailAccountId,
}: {
  chatId: string;
  emailAccountId: string;
}) {
  const result = await prisma.chat.deleteMany({
    where: {
      id: chatId,
      emailAccountId,
    },
  });

  return result.count > 0;
}
