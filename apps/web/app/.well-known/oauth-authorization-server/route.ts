import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";

export async function GET(request: Request) {
  if (!env.MCP_SERVER_ENABLED) {
    return new Response(null, { status: 404 });
  }

  const discoveryHandler = oAuthDiscoveryMetadata(betterAuthConfig);

  return discoveryHandler(request);
}
