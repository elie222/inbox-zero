import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import prisma from "@/utils/__mocks__/prisma";
import { mcpOAuthPlugins } from "@/utils/mcp/oauth-provider";
import { verifyMcpToken } from "@/utils/mcp/verify-token";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: {
    MCP_SERVER_ENABLED: true,
    NEXT_PUBLIC_EXTERNAL_API_ENABLED: true,
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

const origin = "http://localhost:3000";
const resource = `${origin}/api/mcp-server`;

// Exercise the real OAuth provider, PKCE, consent, token rotation and JWT verification.
// Only persistence is replaced; no auth or MCP transport classes are mocked.
describe("MCP OAuth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      mcpServerEnabled: true,
      mcpTokenVersion: 0,
    } as never);
  });

  it("requires consent, rejects a tampered decision, and issues resource-bound scoped tokens", async () => {
    const flow = await createFlow();
    const unauthorized = await flow.request(`/oauth2/authorize?${flow.query}`);
    expect(unauthorized.status).toBe(302);
    expect(unauthorized.headers.get("location")).toContain("/mcp/login?");

    const consent = await flow.request(
      `/oauth2/authorize?${flow.query}`,
      undefined,
      flow.cookie,
    );
    expect(consent.status).toBe(302);
    const consentLocation = consent.headers.get("location");
    assert(consentLocation);
    const consentUrl = new URL(consentLocation, origin);
    expect(consentUrl.pathname).toBe("/mcp/consent");
    expect(consentUrl.searchParams.has("code")).toBe(false);

    const tampered = new URLSearchParams(consentUrl.search);
    tampered.set("scope", "mcp:write");
    const invalid = await flow.request(
      "/oauth2/consent",
      { accept: true, oauth_query: tampered.toString() },
      flow.cookie,
    );
    expect(invalid.ok).toBe(false);

    const approved = await flow.request(
      "/oauth2/consent",
      { accept: true, oauth_query: consentUrl.searchParams.toString() },
      flow.cookie,
    );
    expect(approved.status).toBe(200);
    const approval = await approved.json();
    const code = new URL(approval.url).searchParams.get("code");
    assert(code);
    const wrongResource = await flow.request("/oauth2/token", {
      grant_type: "authorization_code",
      code,
      client_id: flow.clientId,
      redirect_uri: "https://client.example.com/callback",
      code_verifier: flow.verifier,
      resource: "https://other.example.com/mcp",
    });
    expect(wrongResource.ok).toBe(false);
    expect((await wrongResource.json()).error).toBe("invalid_target");

    const wrongVerifier = await flow.token(code, "wrong-verifier");
    expect(wrongVerifier.ok).toBe(false);

    // A failed exchange may consume a code; obtain another one after recorded consent.
    const authorized = await flow.request(
      `/oauth2/authorize?${flow.query}`,
      undefined,
      flow.cookie,
    );
    const authorizedLocation = authorized.headers.get("location");
    assert(authorizedLocation);
    const authorizedUrl = new URL(authorizedLocation, origin);
    const authorizedCode = authorizedUrl.searchParams.get("code");
    assert(authorizedCode);
    const exchanged = await flow.token(authorizedCode, flow.verifier);
    expect(exchanged.status).toBe(200);
    const tokens = await exchanged.json();
    expect(tokens.refresh_token).toBeTruthy();
    const jwks = await flow.auth.api.getJwks();
    prisma.oauthConsent.findFirst.mockResolvedValue({
      scopes: ["mcp:read", "offline_access"],
    } as never);
    prisma.session.findFirst.mockResolvedValue({
      id: "active-session",
    } as never);
    const principal = await verifyMcpToken(tokens.access_token, jwks);
    expect(principal?.scopes).toEqual(["mcp:read", "offline_access"]);
    expect(principal?.userId).toBeTruthy();
    expect(prisma.oauthConsent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: flow.clientId,
          user: { mcpServerEnabled: true, mcpTokenVersion: 0 },
        }),
      }),
    );

    const expandedRefresh = await flow.request("/oauth2/token", {
      client_id: flow.clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      resource: "https://other.example.com/mcp",
    });
    expect(expandedRefresh.ok).toBe(false);
    expect((await expandedRefresh.json()).error).toBe("invalid_target");

    const refresh = await flow.request("/oauth2/token", {
      client_id: flow.clientId,
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      resource,
    });
    expect(refresh.status).toBe(200);
    const refreshed = await refresh.json();
    expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);
    expect(
      (await verifyMcpToken(refreshed.access_token, jwks))?.scopes,
    ).toEqual(principal?.scopes);

    const replay = await flow.token(authorizedCode, flow.verifier);
    expect(replay.ok).toBe(false);

    prisma.oauthConsent.findFirst.mockResolvedValue(null);
    expect(await verifyMcpToken(tokens.access_token, jwks)).toBeNull();
  });

  it("returns access_denied without issuing a code when consent is denied", async () => {
    const flow = await createFlow();
    const response = await flow.request(
      `/oauth2/authorize?${flow.query}`,
      undefined,
      flow.cookie,
    );
    const location = response.headers.get("location");
    assert(location);
    const signed = new URL(location, origin).searchParams.toString();
    const rejected = await flow.request(
      "/oauth2/consent",
      { accept: false, oauth_query: signed },
      flow.cookie,
    );
    const target = new URL((await rejected.json()).url);
    expect(target.searchParams.get("error")).toBe("access_denied");
    expect(target.searchParams.has("code")).toBe(false);
  });
});

async function createFlow() {
  const db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    oauthClient: [],
    oauthResource: [],
    oauthClientResource: [],
    oauthClientAssertion: [],
    oauthConsent: [],
    oauthAccessToken: [],
    oauthRefreshToken: [],
    jwks: [],
  };
  const auth = betterAuth({
    baseURL: origin,
    secret: "test-mcp-oauth-secret-at-least-32-characters",
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true },
    plugins: mcpOAuthPlugins(),
  });
  const request = (
    path: string,
    body?: Record<string, unknown>,
    cookie?: string,
  ) =>
    auth.handler(
      new Request(`${origin}/api/auth${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          origin,
          "content-type":
            path === "/oauth2/token"
              ? "application/x-www-form-urlencoded"
              : "application/json",
          ...(cookie ? { cookie } : {}),
        },
        ...(body && {
          body:
            path === "/oauth2/token"
              ? new URLSearchParams(body as Record<string, string>).toString()
              : JSON.stringify(body),
        }),
      }),
    );
  const signup = await request("/sign-up/email", {
    name: "MCP Test",
    email: "mcp@example.com",
    password: "secure-test-password-123",
  });
  expect(signup.status).toBe(200);
  const cookie = signup.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const registration = await request("/oauth2/register", {
    client_name: "Test MCP client",
    redirect_uris: ["https://client.example.com/callback"],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "mcp:read offline_access",
  });
  expect(registration.status).toBe(201);
  const client = await registration.json();
  const verifier = "test-pkce-verifier-with-at-least-forty-three-characters";
  const query = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: "https://client.example.com/callback",
    response_type: "code",
    scope: "mcp:read offline_access",
    resource,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: "test-state",
  });
  const token = (code: string, codeVerifier: string) =>
    request("/oauth2/token", {
      grant_type: "authorization_code",
      code,
      client_id: client.client_id,
      redirect_uri: "https://client.example.com/callback",
      code_verifier: codeVerifier,
      resource,
    });
  return {
    auth,
    request,
    cookie,
    query,
    verifier,
    token,
    clientId: client.client_id,
  };
}
