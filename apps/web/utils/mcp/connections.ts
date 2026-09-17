import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

export async function listMcpConnections(userId: string) {
  const consents = await prisma.oauthConsent.findMany({
    where: { userId, client: { disabled: false } },
    select: {
      clientId: true,
      scopes: true,
      createdAt: true,
      updatedAt: true,
      client: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return consents.map((consent) => ({
    clientId: consent.clientId,
    name: consent.client.name || "MCP application",
    scopes: consent.scopes,
    createdAt: consent.createdAt,
    updatedAt: consent.updatedAt,
  }));
}

export async function revokeMcpConnection({
  userId,
  clientId,
}: {
  userId: string;
  clientId: string;
}) {
  const consent = await prisma.oauthConsent.findFirst({
    where: { userId, clientId },
    select: { clientId: true },
  });
  if (!consent) {
    throw new SafeError("MCP application not found");
  }

  await prisma.$transaction([
    prisma.oauthAccessToken.deleteMany({ where: { userId, clientId } }),
    prisma.oauthRefreshToken.deleteMany({ where: { userId, clientId } }),
    prisma.oauthConsent.deleteMany({ where: { userId, clientId } }),
  ]);
}
