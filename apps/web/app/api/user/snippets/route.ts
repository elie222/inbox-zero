import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetSnippetsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("user/snippets", async (request) => {
  const { emailAccountId } = request.auth;
  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const snippets = await prisma.snippet.findMany({
    where: { emailAccountId },
    orderBy: { shortcut: "asc" },
    select: {
      content: true,
      id: true,
      shortcut: true,
      updatedAt: true,
    },
  });

  return { snippets };
}
