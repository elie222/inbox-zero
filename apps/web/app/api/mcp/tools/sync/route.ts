import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { McpOrchestrator } from "@inboxzero/mcp";

export const POST = withEmailAccount(async (req) => {
  const emailAccountId = req.auth.emailAccountId;
  const { connectionId } = await req.json().catch(() => ({} as any));
  if (!connectionId) return NextResponse.json({ error: "connectionId required" }, { status: 400 });

  const connection = await prisma.mcpConnection.findFirst({
    where: { id: connectionId, emailAccountId },
    include: { integration: true },
  });
  if (!connection) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const orchestrator = new McpOrchestrator(async () => [
    {
      id: connection.id,
      integrationName: connection.integration.name,
      serverUrl: connection.integration.serverUrl,
      npmPackage: connection.integration.npmPackage,
      approvedTools: connection.approvedTools,
      credentials: {
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        apiKey: connection.apiKey,
        expiresAt: connection.expiresAt,
      },
      isActive: connection.isActive,
    },
  ]);

  const tools = await orchestrator.listTools();

  // Upsert tools for this connection
  await Promise.all(
    tools.map((t) =>
      prisma.mcpTool.upsert({
        where: { connectionId_name: { connectionId, name: t.name.split(":")[1] ?? t.name } },
        update: {
          title: t.title,
          description: t.description,
          schema: t.schema as any,
          isEnabled: true,
        },
        create: {
          connectionId,
          name: t.name.split(":")[1] ?? t.name,
          title: t.title,
          description: t.description,
          schema: t.schema as any,
        },
      }),
    ),
  );

  const updated = await prisma.mcpTool.findMany({ where: { connectionId } });
  return NextResponse.json({ tools: updated });
});

