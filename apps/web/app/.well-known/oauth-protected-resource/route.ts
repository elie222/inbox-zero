import { env } from "@/env";
import {
  MCP_SCOPES,
  getMcpResourceUrl,
  isMcpServerAvailable,
} from "@/utils/mcp/config";

export async function GET() {
  if (!isMcpServerAvailable()) return new Response(null, { status: 404 });
  return Response.json({
    resource: getMcpResourceUrl(),
    authorization_servers: [`${env.NEXT_PUBLIC_BASE_URL}/api/auth`],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
  });
}
