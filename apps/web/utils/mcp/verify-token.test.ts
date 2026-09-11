import { beforeAll, beforeEach, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { verifyMcpToken } from "@/utils/mcp/verify-token";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_BASE_URL: "https://inbox.example.com" },
}));
let keys: Awaited<ReturnType<typeof generateKeyPair>>;
let jwks: { keys: Awaited<ReturnType<typeof exportJWK>>[] };

beforeAll(async () => {
  keys = await generateKeyPair("ES256");
  jwks = {
    keys: [
      { ...(await exportJWK(keys.publicKey)), kid: "test-key", alg: "ES256" },
    ],
  };
});
beforeEach(() => {
  vi.clearAllMocks();
  prisma.oauthConsent.findFirst.mockResolvedValue({
    scopes: ["mcp:read"],
  } as never);
  prisma.session.findFirst.mockResolvedValue({ id: "session" } as never);
});

it.each([
  ["expired", { exp: 1 }],
  ["wrong audience", { aud: "https://other.example.com" }],
  ["wrong issuer", { iss: "https://other.example.com" }],
  ["missing subject", { sub: undefined }],
])("rejects a token with %s before reading grants", async (_name, overrides) => {
  await expect(verifyMcpToken(await sign(overrides), jwks)).rejects.toThrow();
  expect(prisma.oauthConsent.findFirst).not.toHaveBeenCalled();
});

it("limits a token to the permissions still granted to its client", async () => {
  expect(
    await verifyMcpToken(await sign({ scope: "mcp:read mcp:write" }), jwks),
  ).toEqual({ userId: "owner", scopes: ["mcp:read"] });
});

it("rejects revoked or disabled grants", async () => {
  prisma.oauthConsent.findFirst.mockResolvedValue(null);
  expect(await verifyMcpToken(await sign(), jwks)).toBeNull();
  expect(prisma.oauthConsent.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        userId: "owner",
        clientId: "client",
        client: { disabled: false },
        user: { mcpServerEnabled: true, mcpTokenVersion: 3 },
      },
    }),
  );
});

it("rejects an expired, removed, or email-code session", async () => {
  prisma.session.findFirst.mockResolvedValue(null);
  expect(await verifyMcpToken(await sign(), jwks)).toBeNull();
  expect(prisma.session.findFirst).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        id: "session",
        userId: "owner",
        expires: { gt: expect.any(Date) },
        emailOtp: false,
      },
    }),
  );
});

it("rejects a malformed token version before querying Prisma", async () => {
  expect(
    await verifyMcpToken(await sign({ mcp_token_version: {} }), jwks),
  ).toBeNull();
  expect(prisma.oauthConsent.findFirst).not.toHaveBeenCalled();
});

async function sign(overrides: JWTPayload = {}) {
  return new SignJWT({
    sub: "owner",
    azp: "client",
    sid: "session",
    scope: "mcp:read",
    mcp_token_version: 3,
    aud: "https://inbox.example.com/api/mcp-server",
    iss: "https://inbox.example.com/api/auth",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .sign(keys.privateKey);
}
