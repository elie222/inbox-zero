import prisma from "@/utils/prisma";
import { McpOrchestrator } from "@inboxzero/mcp";

export async function getOrchestratorForEmailAccount(emailAccountId: string) {
  const connections = await prisma.mcpConnection.findMany({
    where: { emailAccountId, isActive: true },
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

export async function listMcpToolsForEmailAccount(emailAccountId: string) {
  const orchestrator = await getOrchestratorForEmailAccount(emailAccountId);
  return await orchestrator.listTools();
}

export async function callMcpToolForEmailAccount(
  emailAccountId: string,
  qualifiedName: string,
  args?: Record<string, unknown>,
) {
  const orchestrator = await getOrchestratorForEmailAccount(emailAccountId);
  return await orchestrator.callTool(qualifiedName, args);
}
