import { env } from "@/env";

export const MCP_SCOPES = ["mcp:read", "mcp:write", "offline_access"] as const;

export function isMcpServerAvailable() {
  return env.MCP_SERVER_ENABLED && env.NEXT_PUBLIC_EXTERNAL_API_ENABLED;
}

export function getMcpResourceUrl() {
  return `${env.NEXT_PUBLIC_BASE_URL}/api/mcp-server`;
}
