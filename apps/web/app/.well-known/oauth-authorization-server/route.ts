import { oAuthDiscoveryMetadata } from "better-auth/plugins";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";

const discoveryHandler = env.MCP_SERVER_ENABLED
  ? oAuthDiscoveryMetadata(betterAuthConfig)
  : null;

export async function GET(request: Request) {
  if (!discoveryHandler) {
    return new Response(null, { status: 404 });
  }

  return discoveryHandler(request);
}
