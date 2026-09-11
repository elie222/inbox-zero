import { env } from "@/env";

export const MCP_SCOPES = ["mcp:read", "mcp:write", "offline_access"] as const;

export function isMcpServerAvailable() {
  if (!env.MCP_SERVER_ENABLED || !env.NEXT_PUBLIC_EXTERNAL_API_ENABLED)
    return false;
  const url = new URL(env.NEXT_PUBLIC_BASE_URL);
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  );
}

export function getMcpResourceUrl() {
  return `${env.NEXT_PUBLIC_BASE_URL}/api/mcp-server`;
}
