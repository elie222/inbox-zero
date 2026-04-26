import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type ApiKeyResponse = Awaited<ReturnType<typeof getApiKeys>>;

async function getApiKeys({
  userId,
  emailAccountId,
}: {
  userId: string;
  emailAccountId: string;
}) {
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId, emailAccountId, isActive: true },
    select: {
      id: true,
      name: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true,
      scopes: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return { apiKeys };
}

export const GET = withEmailAccount("user/api-keys", async (request) => {
  const userId = request.auth.userId;
  const emailAccountId = request.auth.emailAccountId;

  const apiKeys = await getApiKeys({ userId, emailAccountId });

  return NextResponse.json(apiKeys);
});
