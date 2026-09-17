import { errors } from "jose";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import { handleMcpServerRequest } from "@/utils/mcp/server";
import { isMcpServerAvailable } from "@/utils/mcp/config";
import {
  getMcpIpRateLimitResponse,
  getMcpUserRateLimitResponse,
} from "@/utils/mcp/rate-limit";
import { verifyMcpToken } from "@/utils/mcp/verify-token";
import type { Logger } from "@/utils/logger";

const MCP_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

export function handleMcpOptionsRequest() {
  if (!isMcpServerAvailable()) return new Response(null, { status: 404 });
  return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
}

export function handleMcpUnsupportedMethod() {
  if (!isMcpServerAvailable()) return new Response(null, { status: 404 });
  return new Response(null, {
    status: 405,
    headers: { ...MCP_CORS_HEADERS, Allow: "POST, OPTIONS" },
  });
}

export async function handleMcpPostRequest(request: Request, logger?: Logger) {
  if (!isMcpServerAvailable()) return new Response(null, { status: 404 });

  const ipLimited = await getMcpIpRateLimitResponse({ request, logger });
  if (ipLimited) return withCors(ipLimited);

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

  const userLimited = await getMcpUserRateLimitResponse({
    userId: principal.userId,
    logger,
  });
  if (userLimited) return withCors(userLimited);

  const response = await handleMcpServerRequest(request, principal);
  return withCors(response);
}

function unauthorized() {
  return new Response(null, {
    status: 401,
    headers: {
      ...MCP_CORS_HEADERS,
      "WWW-Authenticate": `Bearer resource_metadata="${env.NEXT_PUBLIC_BASE_URL}/.well-known/oauth-protected-resource"`,
      "Cache-Control": "no-store",
    },
  });
}

function withCors(response: Response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
