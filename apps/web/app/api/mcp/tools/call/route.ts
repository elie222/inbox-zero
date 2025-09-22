import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withAuth } from "@/utils/middleware";
import { McpOrchestrator } from "@inboxzero/mcp";

export const POST = withAuth(async (req) => {
  const userId = req.auth.userId;
  const { name, args } = await req.json().catch(() => ({} as any));
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const connections = await prisma.mcpConnection.findMany({
    where: { userId, isActive: true },
    include: { integration: true },
  });

  const orchestrator = new McpOrchestrator(async () =>
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

  const result = await orchestrator.callTool(name, args);
  const status = result.ok ? 200 : 400;
  return NextResponse.json(result, { status });
});

