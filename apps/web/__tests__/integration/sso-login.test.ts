import { createEmulator, type Emulator } from "emulate";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { makeSignature } from "better-auth/crypto";
import { decodeJwt, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { adminSso } from "@/utils/auth/sso";

vi.mock("@/env", () => ({ env: { ADMINS: ["admin@example.com"] } }));

const appOrigin = "http://localhost:3000";
const idpOrigin = "http://localhost:4122";
const issuer = `${idpOrigin}/oauth2/default`;
const providerId = "local-sso";
const clientId = "local-sso-client";
const callbackUrl = `${appOrigin}/api/auth/sso/callback/${providerId}`;
const email = "member@example.com";
const nativeFetch = globalThis.fetch;

describe.skipIf(process.env.RUN_INTEGRATION_TESTS !== "true")(
  "SSO login with a local identity provider",
  { timeout: 15_000 },
  () => {
    let emulator: Emulator;
    let signingKey: Awaited<ReturnType<typeof generateKeyPair>>;

    beforeAll(async () => {
      signingKey = await generateKeyPair("RS256");
      emulator = await createEmulator({
        service: "okta",
        port: 4122,
        seed: {
          okta: {
            users: [
              {
                okta_id: "local-member",
                login: email,
                email,
                first_name: "Test",
                last_name: "Member",
              },
            ],
            authorization_servers: [
              { id: "default", name: "default", audiences: ["api://default"] },
            ],
            oauth_clients: [
              {
                client_id: clientId,
                client_secret: "local-client-secret",
                name: "Local SSO",
                redirect_uris: [callbackUrl],
                auth_server_id: "default",
                token_endpoint_auth_method: "client_secret_post",
              },
            ],
          },
        },
      });
    });

    afterEach(() => vi.restoreAllMocks());
    afterAll(async () => {
      await emulator?.close();
    });

    it.each([
      "original",
      "valid-resigned",
    ] as const)("completes login and returns an authenticated session (%s token)", async (mode) => {
      interceptIdp(signingKey, mode);
      const flow = await setup();
      const callback = await flow.startLogin();
      const response = await flow.finishLogin(callback);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(`${appOrigin}/accounts`);
      const session = await flow.auth.api.getSession({
        headers: { cookie: cookiesFrom(response) },
      });
      expect(session?.user.email).toBe(email);
      expect(flow.database.account).toEqual([
        expect.objectContaining({
          providerId,
          accountId: "local-member",
          userId: session?.user.id,
        }),
      ]);
      expect(flow.database.user).toHaveLength(2);
    });

    it.each([
      "invalid-signature",
      "wrong-audience",
      "wrong-issuer",
      "expired",
      "mismatched-subject",
    ] as const)("rejects %s without creating an account or session", async (mode) => {
      interceptIdp(signingKey, mode);
      const flow = await setup();
      const callback = await flow.startLogin();
      const response = await flow.finishLogin(callback);
      const destination = new URL(response.headers.get("location")!);
      expect(destination.searchParams.get("error")).toBe("invalid_provider");
      expect(flow.database.user).toHaveLength(1);
      expect(flow.database.account).toHaveLength(0);
      expect(flow.database.session).toHaveLength(1);
      expect(
        await flow.auth.api.getSession({
          headers: { cookie: cookiesFrom(response) },
        }),
      ).toBeNull();
    });

    it("rejects an unrelated callback state", async () => {
      interceptIdp(signingKey, "original");
      const flow = await setup();
      const callback = await flow.startLogin();
      callback.searchParams.set("state", "unrelated-state");
      const response = await flow.finishLogin(callback);
      expect(
        new URL(response.headers.get("location")!).searchParams.has("error"),
      ).toBe(true);
      expect(flow.database.account).toHaveLength(0);
      expect(flow.database.session).toHaveLength(1);
    });

    it("does not reuse a completed callback to mint another session", async () => {
      interceptIdp(signingKey, "original");
      const flow = await setup();
      const callback = await flow.startLogin();
      const firstResponse = await flow.finishLogin(callback);
      expect(firstResponse.headers.get("location")).toBe(
        `${appOrigin}/accounts`,
      );
      expect(flow.database.session).toHaveLength(2);
      const sessionCount = flow.database.session.length;
      const response = await flow.finishLogin(callback);
      expect(
        new URL(response.headers.get("location")!).searchParams.has("error"),
      ).toBe(true);
      expect(flow.database.session).toHaveLength(sessionCount);
    });

    it("does not silently link an SSO identity to an existing account", async () => {
      interceptIdp(signingKey, "original");
      const flow = await setup();
      flow.database.user.push({
        id: "existing-member",
        email,
        name: "Existing Member",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const callback = await flow.startLogin();
      const response = await flow.finishLogin(callback);
      expect(
        new URL(response.headers.get("location")!).searchParams.has("error"),
      ).toBe(true);
      expect(flow.database.user).toHaveLength(2);
      expect(flow.database.account).toHaveLength(0);
      expect(flow.database.session).toHaveLength(1);
    });

    it("rejects a callback after the provider identity changes", async () => {
      interceptIdp(signingKey, "original");
      const flow = await setup();
      const callback = await flow.startLogin();
      flow.database.ssoProvider[0].issuer = "https://different.example.com";
      const response = await flow.finishLogin(callback);
      expect(
        new URL(response.headers.get("location")!).searchParams.has("error"),
      ).toBe(true);
      expect(flow.database.account).toHaveLength(0);
      expect(flow.database.session).toHaveLength(1);
    });

    it("does not let a basic user register the working identity provider", async () => {
      interceptIdp(signingKey, "original");
      const flow = await setup("basic@example.com");
      expect(flow.registration.status).toBe(403);
      expect(flow.database.ssoProvider).toHaveLength(0);
      expect(flow.database.account).toHaveLength(0);
    });
  },
);

async function setup(adminEmail = "admin@example.com") {
  const secret = "local-sso-integration-secret-with-enough-length";
  const database: Record<string, Record<string, unknown>[]> = {
    user: [
      {
        id: "admin",
        email: adminEmail,
        name: "Administrator",
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
    session: [],
    account: [],
    verification: [],
    ssoProvider: [],
  };
  const auth = betterAuth({
    baseURL: appOrigin,
    secret,
    database: memoryAdapter(database),
    trustedOrigins: [idpOrigin],
    plugins: [
      adminSso({
        disableImplicitSignUp: false,
        organizationProvisioning: { disabled: true },
      }),
    ],
    account: { accountLinking: { trustedProviders: ["google", "apple"] } },
    rateLimit: { enabled: false },
  });
  const context = await auth.$context;
  const adminSession = await context.internalAdapter.createSession("admin");
  const adminCookie = `better-auth.session_token=${encodeURIComponent(`${adminSession.token}.${await makeSignature(adminSession.token, secret)}`)}`;
  const registration = await auth.handler(
    new Request(`${appOrigin}/api/auth/sso/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: appOrigin,
        cookie: adminCookie,
      },
      body: JSON.stringify({
        providerId,
        issuer,
        domain: "example.com",
        oidcConfig: {
          clientId,
          clientSecret: "local-client-secret",
          pkce: true,
          scopes: ["openid", "email", "profile"],
        },
      }),
    }),
  );
  let browserCookie = "";
  const startLogin = async () => {
    expect(registration.status).toBe(200);
    const start = await auth.handler(
      new Request(`${appOrigin}/api/auth/sign-in/sso`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: appOrigin },
        body: JSON.stringify({
          providerId,
          email,
          callbackURL: `${appOrigin}/accounts`,
        }),
      }),
    );
    expect(start.status).toBe(200);
    browserCookie = cookiesFrom(start);
    const authorize = new URL((await start.json()).url);
    expect((await fetch(authorize)).status).toBe(200);
    const form = new URLSearchParams(authorize.searchParams);
    form.set("user_ref", "local-member");
    const response = await fetch(`${issuer}/v1/authorize/callback`, {
      method: "POST",
      body: form,
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    return new URL(response.headers.get("location")!);
  };
  const finishLogin = (url: URL) =>
    auth.handler(new Request(url, { headers: { cookie: browserCookie } }));
  return { auth, database, registration, startLogin, finishLogin };
}

function cookiesFrom(response: Response) {
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

function interceptIdp(
  signingKey: Awaited<ReturnType<typeof generateKeyPair>>,
  mode:
    | "original"
    | "valid-resigned"
    | "invalid-signature"
    | "wrong-audience"
    | "wrong-issuer"
    | "expired"
    | "mismatched-subject",
) {
  // A valid re-signed control proves the audience/issuer/expiry cases fail on claims, not on the test key.
  const resign = [
    "valid-resigned",
    "wrong-audience",
    "wrong-issuer",
    "expired",
  ].includes(mode);
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(
      input instanceof Request ? input.url : input.toString(),
    );
    if (url.origin !== idpOrigin)
      throw new Error(`Unexpected non-local request: ${url.origin}`);
    const response = await nativeFetch(input, {
      ...init,
      signal: AbortSignal.timeout(5000),
    });
    if (resign && url.pathname.endsWith("/keys")) {
      return Response.json({
        keys: [
          {
            ...(await exportJWK(signingKey.publicKey)),
            kid: "local-test-key",
            alg: "RS256",
            use: "sig",
          },
        ],
      });
    }
    if (
      url.pathname.endsWith("/token") &&
      response.ok &&
      (resign || mode === "invalid-signature")
    ) {
      const tokens = await response.json();
      if (resign) {
        const claims = decodeJwt(tokens.id_token);
        if (mode === "wrong-audience") claims.aud = "another-client";
        if (mode === "wrong-issuer")
          claims.iss = "https://different.example.com";
        if (mode === "expired")
          claims.exp = Math.floor(Date.now() / 1000) - 3600;
        tokens.id_token = await new SignJWT(claims)
          .setProtectedHeader({ alg: "RS256", kid: "local-test-key" })
          .sign(signingKey.privateKey);
      } else if (mode === "invalid-signature") {
        const parts = tokens.id_token.split(".");
        parts[2] = `${parts[2][0] === "A" ? "B" : "A"}${parts[2].slice(1)}`;
        tokens.id_token = parts.join(".");
      }
      return Response.json(tokens);
    }
    if (mode === "mismatched-subject" && url.pathname.endsWith("/userinfo")) {
      return Response.json({
        ...(await response.json()),
        sub: "different-member",
      });
    }
    return response;
  });
}
