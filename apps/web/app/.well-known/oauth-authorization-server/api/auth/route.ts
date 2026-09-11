import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { betterAuthConfig } from "@/utils/auth";
import { isMcpServerAvailable } from "@/utils/mcp/config";

export async function GET(request: Request) {
  if (!isMcpServerAvailable()) return new Response(null, { status: 404 });
  return oauthProviderAuthServerMetadata(betterAuthConfig)(request);
}
