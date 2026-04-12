import { withMcpAuth } from "better-auth/plugins";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import { handleMcpServerRequest } from "@/utils/mcp/server";

export async function POST(request: Request) {
  if (!env.MCP_SERVER_ENABLED) {
    return new Response(null, { status: 404 });
  }

  const mcpHandler = withMcpAuth(betterAuthConfig, handleMcpServerRequest);

  return mcpHandler(request);
}
