import { withMcpAuth } from "better-auth/plugins";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import { handleMcpServerRequest } from "@/utils/mcp/server";

const mcpHandler = env.MCP_SERVER_ENABLED
  ? withMcpAuth(betterAuthConfig, handleMcpServerRequest)
  : null;

export async function POST(request: Request) {
  if (!mcpHandler) {
    return new Response(null, { status: 404 });
  }

  return mcpHandler(request);
}
