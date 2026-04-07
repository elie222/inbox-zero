import { oAuthProtectedResourceMetadata } from "better-auth/plugins";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";

const protectedResourceHandler = env.MCP_SERVER_ENABLED
  ? oAuthProtectedResourceMetadata(betterAuthConfig)
  : null;

export async function GET(request: Request) {
  if (!protectedResourceHandler) {
    return new Response(null, { status: 404 });
  }

  return protectedResourceHandler(request);
}
