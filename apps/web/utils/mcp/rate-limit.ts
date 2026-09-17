import type { Logger } from "@/utils/logger";
import {
  checkRateLimit,
  createRateLimitKey,
  getClientIp,
  hashRateLimitValue,
} from "@/utils/rate-limit";

const MCP_HTTP_RATE_LIMITS = {
  ipMinute: { limit: 120, windowSeconds: 60 },
  userMinute: { limit: 60, windowSeconds: 60 },
} as const;

const MCP_OAUTH_RATE_LIMITS = {
  registerIpHour: { limit: 20, windowSeconds: 60 * 60 },
  tokenIpHour: { limit: 100, windowSeconds: 60 * 60 },
  authorizeIpHour: { limit: 60, windowSeconds: 60 * 60 },
} as const;

export function getMcpOAuthRateLimitPath(
  pathname: string,
): "register" | "token" | "authorize" | null {
  if (pathname.endsWith("/oauth2/register")) return "register";
  if (pathname.endsWith("/oauth2/token")) return "token";
  if (pathname.endsWith("/oauth2/authorize")) return "authorize";
  return null;
}

export async function getMcpIpRateLimitResponse({
  request,
  logger,
}: {
  request: Request;
  logger?: Logger;
}) {
  const ipHash = hashRateLimitValue(getClientIp(request.headers));
  const result = await checkRateLimit({
    rule: {
      key: createRateLimitKey(["rate-limit", "mcp", "ip-minute", ipHash]),
      ...MCP_HTTP_RATE_LIMITS.ipMinute,
    },
    logger,
  });
  if (!result.limited) return null;

  logger?.warn("MCP IP rate limit exceeded", {
    limit: result.limit,
    retryAfterSeconds: result.retryAfterSeconds,
  });
  return rateLimitedResponse(result.retryAfterSeconds);
}

export async function getMcpUserRateLimitResponse({
  userId,
  logger,
}: {
  userId: string;
  logger?: Logger;
}) {
  const result = await checkRateLimit({
    rule: {
      key: createRateLimitKey([
        "rate-limit",
        "mcp",
        "user-minute",
        hashRateLimitValue(userId),
      ]),
      ...MCP_HTTP_RATE_LIMITS.userMinute,
    },
    logger,
  });
  if (!result.limited) return null;

  logger?.warn("MCP user rate limit exceeded", {
    limit: result.limit,
    retryAfterSeconds: result.retryAfterSeconds,
  });
  return rateLimitedResponse(result.retryAfterSeconds);
}

export async function getMcpOAuthRateLimitResponse({
  request,
  logger,
}: {
  request: Request;
  logger?: Logger;
}) {
  const kind = getMcpOAuthRateLimitPath(new URL(request.url).pathname);
  if (!kind) return null;

  const limits = {
    register: MCP_OAUTH_RATE_LIMITS.registerIpHour,
    token: MCP_OAUTH_RATE_LIMITS.tokenIpHour,
    authorize: MCP_OAUTH_RATE_LIMITS.authorizeIpHour,
  }[kind];
  const ipHash = hashRateLimitValue(getClientIp(request.headers));
  const result = await checkRateLimit({
    rule: {
      key: createRateLimitKey(["rate-limit", "mcp-oauth", kind, ipHash]),
      ...limits,
    },
    logger,
  });
  if (!result.limited) return null;

  logger?.warn("MCP OAuth rate limit exceeded", {
    kind,
    limit: result.limit,
    retryAfterSeconds: result.retryAfterSeconds,
  });
  return rateLimitedResponse(result.retryAfterSeconds);
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429,
    headers: {
      "Retry-After": String(retryAfterSeconds),
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
