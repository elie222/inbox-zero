import { oAuthProtectedResourceMetadata } from "better-auth/plugins";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";

export async function GET(request: Request) {
  if (!env.MCP_SERVER_ENABLED) {
    return new Response(null, { status: 404 });
  }

  const protectedResourceHandler =
    oAuthProtectedResourceMetadata(betterAuthConfig);

  return protectedResourceHandler(request);
}
