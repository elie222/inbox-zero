import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { isNotFoundError } from "@/utils/prisma-helpers";

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

export async function reduceMcpConnectionScopes({
  userId,
  clientId,
  scopes,
}: {
  userId: string;
  clientId: string;
  scopes: string[];
}) {
  const consent = await prisma.oauthConsent.findFirst({
    where: { userId, clientId },
    select: { id: true, scopes: true },
  });
  if (!consent) throw new SafeError("MCP application not found");
  const selected = [...new Set(scopes)];
  if (
    selected.length === 0 ||
    (consent.scopes.includes("mcp:read") && !selected.includes("mcp:read"))
  ) {
    throw new SafeError(
      "Keep read access, or disconnect the application to remove all access.",
    );
  }
  if (selected.some((scope) => !consent.scopes.includes(scope))) {
    throw new SafeError(
      "Reconnect from the application to approve additional permissions.",
    );
  }
  // The update condition prevents a stale settings request restoring permissions
  // reduced concurrently. Token verification intersects scopes with this grant.
  try {
    await prisma.$transaction([
      prisma.oauthConsent.update({
        where: {
          id: consent.id,
          userId,
          clientId,
          scopes: { equals: consent.scopes },
        },
        data: { scopes: selected },
      }),
      // The OAuth provider refreshes from the token's original scopes, not the
      // current grant. Removing offline access must revoke those tokens too.
      ...(consent.scopes.includes("offline_access") &&
      !selected.includes("offline_access")
        ? [prisma.oauthRefreshToken.deleteMany({ where: { userId, clientId } })]
        : []),
    ]);
  } catch (error) {
    if (isNotFoundError(error)) {
      throw new SafeError("Permissions changed. Refresh and try again.");
    }
    throw error;
  }
  return { clientId, scopes: selected };
}
