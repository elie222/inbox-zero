import prisma from "@/utils/prisma";
import { McpOrchestrator } from "@inboxzero/mcp";

export async function getOrchestratorForUser(userId: string) {
  const connections = await prisma.mcpConnection.findMany({
    where: { userId, isActive: true },
    include: { integration: true },
  });

  return new McpOrchestrator(async () =>
    connections.map((c) => ({
      id: c.id,
      integrationName: c.integration.name,
      serverUrl: c.integration.serverUrl,
      npmPackage: c.integration.npmPackage,
      approvedTools: c.approvedTools,
      credentials: {
        accessToken: c.accessToken,
        refreshToken: c.refreshToken,
        apiKey: c.apiKey,
        expiresAt: c.expiresAt,
      },
      isActive: c.isActive,
    })),
  );
}

export async function listMcpToolsForUser(userId: string) {
  const orchestrator = await getOrchestratorForUser(userId);
  return await orchestrator.listTools();
}

export async function callMcpToolForUser(
  userId: string,
  qualifiedName: string,
  args?: Record<string, unknown>,
) {
  const orchestrator = await getOrchestratorForUser(userId);
  return await orchestrator.callTool(qualifiedName, args);
}

