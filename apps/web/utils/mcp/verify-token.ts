import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from "jose";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { getMcpResourceUrl } from "@/utils/mcp/config";

export async function verifyMcpToken(token: string, jwks: JSONWebKeySet) {
  const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
    issuer: `${env.NEXT_PUBLIC_BASE_URL}/api/auth`,
    audience: getMcpResourceUrl(),
    requiredClaims: [
      "sub",
      "exp",
      "iat",
      "azp",
      "sid",
      "scope",
      "mcp_token_version",
    ],
  });
  if (
    payload.aud !== getMcpResourceUrl() ||
    typeof payload.sub !== "string" ||
    typeof payload.azp !== "string" ||
    typeof payload.sid !== "string" ||
    typeof payload.scope !== "string" ||
    typeof payload.mcp_token_version !== "number" ||
    !Number.isSafeInteger(payload.mcp_token_version)
  )
    return null;

  const grant = await prisma.oauthConsent.findFirst({
    where: {
      userId: payload.sub,
      clientId: payload.azp,
      client: { disabled: false },
      user: {
        mcpServerEnabled: true,
        mcpTokenVersion: payload.mcp_token_version,
      },
    },
    select: { scopes: true },
  });
  if (!grant) return null;
  const session = await prisma.session.findFirst({
    where: {
      id: payload.sid,
      userId: payload.sub,
      expires: { gt: new Date() },
      emailOtp: false,
    },
    select: { id: true },
  });
  if (!session) return null;

  return {
    userId: payload.sub,
    scopes: payload.scope
      .split(" ")
      .filter((scope) => grant.scopes.includes(scope)),
  };
}
