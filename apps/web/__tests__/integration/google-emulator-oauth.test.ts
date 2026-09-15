import assert from "node:assert/strict";
import { createServer } from "node:net";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { createEmulator } from "emulate";
import { expect, onTestFinished, test } from "vitest";

const enabled = process.env.RUN_INTEGRATION_TESTS === "true";

test.skipIf(!enabled).each([false, true])(
  "Google emulator verifies OIDC login with PKCE (tampered nonce: %s)",
  async (tamperNonce) => {
    const origin = "http://localhost:3456";
    const redirectUri = `${origin}/api/auth/callback/google`;
    const email = "oidc-test@example.com";
    const emulator = await createEmulator({
      service: "google",
      port: await availablePort(),
      seed: {
        google: {
          users: [{ email, name: "OIDC Test" }],
          oauth_clients: [
            {
              client_id: "test-client",
              client_secret: "test-secret",
              redirect_uris: [redirectUri],
            },
          ],
        },
      },
    });
    onTestFinished(() => emulator.close());
    const db = { user: [], session: [], account: [], verification: [] };
    const auth = betterAuth({
      baseURL: origin,
      secret: "test-oidc-secret-at-least-32-characters",
      database: memoryAdapter(db),
      plugins: [
        genericOAuth({
          config: [
            {
              providerId: "google",
              clientId: "test-client",
              clientSecret: "test-secret",
              discoveryUrl: `${emulator.url}/.well-known/openid-configuration`,
              scopes: ["openid", "email", "profile"],
            },
          ],
        }),
      ],
    });
    const signIn = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: "/signed-in",
          disableRedirect: true,
        }),
      }),
    );
    expect(signIn.status).toBe(200);
    const authorization = new URL((await signIn.json()).url);
    const params = authorization.searchParams;
    expect(params.get("nonce")).toBeTruthy();
    expect(params.get("code_challenge_method")).toBe("S256");
    if (tamperNonce) params.set("nonce", "wrong-nonce");
    const approved = await fetch(`${emulator.url}/o/oauth2/v2/auth/callback`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...Object.fromEntries(params), email }),
    });
    const callbackUrl = approved.headers.get("location");
    assert(callbackUrl);
    const result = await auth.handler(
      new Request(callbackUrl, {
        headers: {
          cookie: signIn.headers
            .getSetCookie()
            .map((cookie) => cookie.split(";")[0])
            .join("; "),
        },
      }),
    );
    if (tamperNonce) {
      expect(db.user).toHaveLength(0);
      expect(db.session).toHaveLength(0);
      expect(result.headers.get("location")).not.toBe("/signed-in");
      return;
    }
    expect(result.headers.get("location")).toBe("/signed-in");
    expect(db.user).toEqual([expect.objectContaining({ email })]);
    expect(db.session).toHaveLength(1);
  },
);

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
