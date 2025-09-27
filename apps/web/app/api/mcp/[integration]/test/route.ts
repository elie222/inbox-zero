import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import { testMcpConnection } from "@/utils/mcp/test-mcp";
import {
  MCP_INTEGRATIONS,
  type IntegrationKey,
} from "@/utils/mcp/integrations";

const logger = createScopedLogger("mcp/test");

export type GetMcpTestResponse = {
  connected: boolean;
  error?: string;
  tools?: Array<{ name: string; description?: string; inputSchema?: unknown }>;
  debug?: {
    toolsCount?: number;
    connectionDetails?: unknown;
  };
};

export const GET = withEmailAccount(async (request, { params }) => {
  const { integration } = await params;
  const { emailAccountId } = request.auth;

  if (!MCP_INTEGRATIONS[integration as IntegrationKey]) {
    throw new SafeError(`Unknown integration: ${integration}`);
  }

  try {
    const result = await testMcpConnection(
      integration as IntegrationKey,
      emailAccountId,
    );

    logger.info("MCP connection test completed", {
      integration,
      userId: request.auth.userId,
      emailAccountId,
      connected: result.connected,
      toolsCount: result.tools?.length || 0,
    });

    return NextResponse.json<GetMcpTestResponse>(result);
  } catch (error) {
    logger.error("Failed to test MCP connection", {
      error,
      integration,
      userId: request.auth.userId,
      emailAccountId,
    });

    return NextResponse.json(
      {
        connected: false,
        error: "Failed to test connection",
      },
      { status: 500 },
    );
  }
});
