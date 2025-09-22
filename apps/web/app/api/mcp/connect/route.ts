import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";
import { MCP_INTEGRATIONS } from "@inboxzero/mcp";

export const POST = withEmailAccount(async (req) => {
  const emailAccountId = req.auth.emailAccountId;
  const body = await req.json();
  const { integrationName, name, apiKey } = body ?? {};
  if (!integrationName || !name) {
    return NextResponse.json({ error: "integrationName and name required" }, { status: 400 });
  }

  let integration = await prisma.mcpIntegration.findUnique({ where: { name: integrationName } });
  if (!integration) {
    const reg = MCP_INTEGRATIONS[integrationName as keyof typeof MCP_INTEGRATIONS];
    if (!reg) return NextResponse.json({ error: "Unknown integration" }, { status: 404 });
    integration = await prisma.mcpIntegration.create({
      data: {
        name: reg.name,
        displayName: reg.displayName,
        description: reg.description,
        serverUrl: reg.serverUrl,
        npmPackage: reg.npmPackage,
        authType: reg.authType,
        defaultScopes: reg.defaultScopes,
      },
    });
  }

  // For api-token type, allow creating with apiKey
  const connection = await prisma.mcpConnection.upsert({
    where: { emailAccountId_integrationId: { emailAccountId, integrationId: integration.id } },
    update: {
      name,
      apiKey: apiKey ?? undefined,
      isActive: true,
    },
    create: {
      emailAccountId,
      integrationId: integration.id,
      name,
      apiKey: apiKey ?? undefined,
      approvedScopes: integration.defaultScopes,
      approvedTools: [],
    },
    include: { integration: true },
  });

  return NextResponse.json({ connection });
});

