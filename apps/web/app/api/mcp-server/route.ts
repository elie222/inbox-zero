import { errors } from "jose";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import { handleMcpServerRequest } from "@/utils/mcp/server";
import { isMcpServerAvailable } from "@/utils/mcp/config";
import { verifyMcpToken } from "@/utils/mcp/verify-token";
import { withError } from "@/utils/middleware";

export const POST = withError("mcp-server", async (request) => {
  if (!isMcpServerAvailable()) return new Response(null, { status: 404 });
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return unauthorized();

  let principal: Awaited<ReturnType<typeof verifyMcpToken>>;
  try {
    principal = await verifyMcpToken(
      token,
      await betterAuthConfig.api.getJwks(),
    );
  } catch (error) {
    if (error instanceof errors.JOSEError) return unauthorized();
    throw error;
  }
  if (!principal) return unauthorized();
  return handleMcpServerRequest(request, principal);
});

function unauthorized() {
  return new Response(null, {
    status: 401,
    headers: {
      "WWW-Authenticate": `Bearer resource_metadata="${env.NEXT_PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`,
      "Cache-Control": "no-store",
    },
  });
}
