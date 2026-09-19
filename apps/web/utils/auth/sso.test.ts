import { beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "@/env";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { makeSignature } from "better-auth/crypto";
import { adminSso } from "@/utils/auth/sso";

vi.mock("@/env", () => ({ env: { ADMINS: ["admin@example.com"] } }));

const registration = {
  providerId: "example-sso",
  issuer: "https://idp.example.com",
  domain: "example.com",
  oidcConfig: {
    clientId: "local-client",
    clientSecret: "local-secret",
    skipDiscovery: true,
    authorizationEndpoint: "https://idp.example.com/authorize",
    tokenEndpoint: "https://idp.example.com/token",
    jwksEndpoint: "https://idp.example.com/jwks",
  },
};
const mutations = [
  ["/sso/register", registration],
  [
    "/sso/update-provider",
    { providerId: registration.providerId, domain: "updated.example.com" },
  ],
  ["/sso/delete-provider", { providerId: registration.providerId }],
  ["/sso/request-domain-verification", { providerId: registration.providerId }],
  ["/sso/verify-domain", { providerId: registration.providerId }],
] as const;

describe("SSO management authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.ADMINS = ["admin@example.com"];
  });

  it("classifies every installed SSO endpoint for authorization coverage", () => {
    const plugin = adminSso({ domainVerification: { enabled: true } });
    // Plugin upgrades must not silently introduce untested management routes.
    expect(
      Object.values(plugin.endpoints)
        .map((endpoint) => endpoint.path)
        .sort(),
    ).toEqual(
      [
        ...mutations.map(([path]) => path),
        "/sso/providers",
        "/sso/get-provider",
        "/sign-in/sso",
        "/sso/callback/:providerId",
        "/sso/callback",
        "/sso/saml2/sp/metadata",
        "/sso/saml2/sp/acs/:providerId",
        "/sso/saml2/sp/slo/:providerId",
        "/sso/saml2/logout/:providerId",
      ].sort(),
    );
  });

  it("fails closed when no application admins are configured", async () => {
    env.ADMINS = undefined;
    const { request, database } = await setup("admin@example.com");
    expect((await request("/sso/register", registration)).status).toBe(403);
    expect(database.ssoProvider).toHaveLength(0);
  });

  it.each([
    "/sso/providers",
    `/sso/get-provider?providerId=${registration.providerId}`,
  ])("restricts management reads on %s", async (path) => {
    const basic = await setup("basic@example.com", { existingProvider: true });
    expect((await basic.request(path)).status).toBe(403);
    const anonymous = await setup();
    expect((await anonymous.request(path)).status).toBe(401);
    const admin = await setup("admin@example.com", { existingProvider: true });
    expect((await admin.request(path)).status).toBe(200);
  });

  it("lets an admin update, request verification, and delete its provider", async () => {
    const { request, database } = await setup("admin@example.com", {
      existingProvider: true,
    });
    const body = { providerId: registration.providerId };
    expect(
      (
        await request("/sso/update-provider", {
          ...body,
          domain: "updated.example.com",
        })
      ).status,
    ).toBe(200);
    expect(database.ssoProvider[0].domain).toBe("updated.example.com");
    expect((await request("/sso/verify-domain", body)).status).toBe(404);
    const verification = await request(
      "/sso/request-domain-verification",
      body,
    );
    expect(verification.status).toBe(201);
    const { domainVerificationToken } = await verification.json();
    expect(domainVerificationToken).toBeTruthy();
    expect(database.verification).toHaveLength(1);
    expect((await request("/sso/delete-provider", body)).status).toBe(200);
    expect(database.ssoProvider).toHaveLength(0);
  });

  it.each([
    "/sso/update-provider",
    "/sso/delete-provider",
  ])("retains provider ownership checks on %s for admins", async (path) => {
    const { request, database } = await setup("admin@example.com", {
      existingProvider: true,
    });
    database.ssoProvider[0].userId = "other-user";
    const before = structuredClone(database.ssoProvider);
    expect(
      (
        await request(path, {
          providerId: registration.providerId,
          domain: "updated.example.com",
        })
      ).status,
    ).toBe(403);
    expect(database.ssoProvider).toEqual(before);
  });

  it.each([
    ["/sso/callback/example-sso", undefined, 302],
    ["/sso/callback", undefined, 302],
    ["/sso/saml2/sp/acs/example-sso", { SAMLResponse: "invalid" }, 404],
  ] as const)("keeps public callback handling accessible on %s", async (path, body, status) => {
    const { request } = await setup();
    const response = await request(path, body);
    expect(response.status).toBe(status);
    if (status === 302) expect(response.headers.get("location")).toBeTruthy();
    else expect((await response.json()).message).toBe("No SAML provider found");
  });

  it.each(
    mutations,
  )("rejects basic users on %s without changing stored state", async (path, body) => {
    const { request, database } = await setup("basic@example.com", {
      existingProvider: path !== "/sso/register",
    });
    const before = structuredClone(database);
    const response = await request(path, body);
    expect(response.status).toBe(403);
    expect(database).toEqual(before);
  });

  it.each([
    "/sso/register/",
    "/sso/%72egister",
    "/sso//register",
  ])("does not accept alternate management URLs: %s", async (path) => {
    const { request, database } = await setup("basic@example.com");
    expect([403, 404]).toContain((await request(path, registration)).status);
    expect(database.ssoProvider).toHaveLength(0);
  });

  it.each(mutations)("requires a session on %s", async (path, body) => {
    const { request } = await setup();
    expect((await request(path, body)).status).toBe(401);
  });

  it.each([
    "registerSSOProvider",
    "updateSSOProvider",
    "deleteSSOProvider",
    "requestDomainVerification",
    "verifyDomain",
  ] as const)("rejects basic users through the %s server API", async (method) => {
    const { auth, headers, database } = await setup("basic@example.com");
    await expect(
      auth.api[method]({ headers, body: registration }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(database.ssoProvider).toHaveLength(0);
  });

  it("allows an application admin to register a provider over HTTP and initiate public login", async () => {
    const { request, database } = await setup("admin@example.com", {
      domainVerificationEnabled: false,
    });
    const response = await request("/sso/register", registration);
    expect(response.status).toBe(200);
    expect(database.ssoProvider).toHaveLength(1);
    const login = await request(
      "/sign-in/sso",
      { providerId: registration.providerId, callbackURL: "/" },
      false,
    );
    expect(login.status).toBe(200);
    expect((await login.json()).url).toMatch(
      /^https:\/\/idp\.example\.com\/authorize\?/,
    );
  });

  it("allows an application admin through the server API", async () => {
    const { auth, headers, database } = await setup("admin@example.com");
    await auth.api.registerSSOProvider({ headers, body: registration });
    expect(database.ssoProvider).toHaveLength(1);
  });
});

async function setup(
  email?: string,
  { existingProvider = false, domainVerificationEnabled = true } = {},
) {
  const secret = "local-sso-tests-secret-with-sufficient-length";
  const database: Record<string, Record<string, unknown>[]> = {
    user: email
      ? [
          {
            id: "user",
            email,
            name: "Test User",
            emailVerified: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]
      : [],
    session: [],
    account: [],
    verification: [],
    ssoProvider: existingProvider
      ? [
          {
            id: "provider",
            ...registration,
            oidcConfig: JSON.stringify(registration.oidcConfig),
            userId: "user",
          },
        ]
      : [],
  };
  const auth = betterAuth({
    baseURL: "http://localhost:3000",
    secret,
    database: memoryAdapter(database),
    plugins: [
      adminSso({
        disableImplicitSignUp: false,
        organizationProvisioning: { disabled: true },
        domainVerification: { enabled: domainVerificationEnabled },
      }),
    ],
    rateLimit: { enabled: false },
  });
  const headers = new Headers({
    "content-type": "application/json",
    origin: "http://localhost:3000",
  });
  if (email) {
    const context = await auth.$context;
    const session = await context.internalAdapter.createSession("user");
    headers.set(
      "cookie",
      `better-auth.session_token=${encodeURIComponent(`${session.token}.${await makeSignature(session.token, secret)}`)}`,
    );
  }
  const request = (path: string, body?: unknown, authenticated = true) => {
    const requestHeaders = new Headers(headers);
    if (!authenticated) requestHeaders.delete("cookie");
    return auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: requestHeaders,
        body: JSON.stringify(body),
      }),
    );
  };
  return { auth, headers, database, request };
}
