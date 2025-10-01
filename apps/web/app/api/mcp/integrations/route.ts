import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { MCP_INTEGRATIONS } from "@/utils/mcp/integrations";
import prisma from "@/utils/prisma";

export type GetIntegrationsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  return NextResponse.json(await getData(emailAccountId));
});

async function getData(emailAccountId: string) {
  const connections = await prisma.mcpConnection.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      name: true,
      isActive: true,
      integration: { select: { id: true, name: true } },
      tools: { select: { id: true, name: true, isEnabled: true } },
    },
  });

  const integrations = Object.values(MCP_INTEGRATIONS).map((integration) => ({
    name: integration.name,
    displayName: integration.displayName,
    comingSoon: integration.comingSoon,
    authType: integration.authType,
    connection: connections.find(
      (connection) => connection.integration.name === integration.name,
    ),
  }));

  return { integrations };
}
