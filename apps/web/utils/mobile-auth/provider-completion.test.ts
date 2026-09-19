import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthMiddleware } from "better-auth/api";
import { oAuthProxy } from "better-auth/plugins";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { beforeEach, expect, it, vi } from "vitest";
import { mobileAuthProviderCompletion } from "./provider-completion";

const { completeMock } = vi.hoisted(() => ({ completeMock: vi.fn() }));
vi.mock("@/utils/mobile-auth/oauth-code", () => ({
  completeMobileAuthState: completeMock,
}));
vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_BASE_URL: "https://app.example" },
}));

beforeEach(() => vi.clearAllMocks());

it("runs completion only after Better Auth validates OAuth and creates a session", async () => {
  const { auth, start, cookie, providerState, callbackURL } = await startFlow();
  expect(start.status).toBe(200);
  expect(completeMock).not.toHaveBeenCalled();
  const response = await auth.handler(
    new Request(
      `https://app.example/api/auth/callback/google?code=provider-code&state=${providerState}`,
      { headers: { cookie } },
    ),
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(callbackURL);
  const session = await auth.api.getSession({
    headers: { cookie: cookies(response) },
  });
  expect(session?.user.email).toBe("user@example.com");
  expect(completeMock).toHaveBeenCalledExactlyOnceWith({
    state: "state-1234567890",
    completionToken: "completion-secret",
    provider: "google",
    sessionToken: session?.session.token,
  });
});

it.each([
  "error=access_denied",
  "code=provider-code&state=unissued-state",
])("does not complete a rejected provider callback: %s", async (query) => {
  const { auth, cookie, providerState } = await startFlow();
  const params = new URLSearchParams(query);
  if (!params.has("state")) params.set("state", providerState);
  const response = await auth.handler(
    new Request(`https://app.example/api/auth/callback/google?${params}`, {
      headers: { cookie },
    }),
  );
  expect(response.status).toBe(302);
  expect(completeMock).not.toHaveBeenCalled();
});

it("preserves completion binding through the OAuth preview proxy", async () => {
  const { auth, cookie, providerState, callbackURL } = await startFlow(true);
  const proxy = createTestAuth("https://proxy.example", true);
  const providerCallback = await proxy.handler(
    new Request(
      `https://proxy.example/api/auth/callback/google?code=provider-code&state=${encodeURIComponent(providerState)}`,
    ),
  );
  expect(providerCallback.status).toBe(302);
  expect(completeMock).not.toHaveBeenCalled();
  const completionUrl = providerCallback.headers.get("location")!;
  expect(new URL(completionUrl).pathname).toBe(
    "/api/auth/callback/google/oauth-proxy",
  );
  const response = await auth.handler(
    new Request(completionUrl, { headers: { cookie } }),
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(callbackURL);
  expect(completeMock).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      state: "state-1234567890",
      completionToken: "completion-secret",
      provider: "google",
    }),
  );
});

function createTestAuth(origin = "https://app.example", proxy = false) {
  return betterAuth({
    baseURL: origin,
    trustedOrigins: ["https://app.example", "https://proxy.example"],
    account: { storeStateStrategy: "cookie" },
    secret: "test-secret".repeat(4),
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
    }),
    plugins: [
      ...(proxy
        ? [
            oAuthProxy({
              productionURL: "https://proxy.example",
              currentURL: origin,
            }),
          ]
        : []),
      genericOAuth({
        config: [
          {
            providerId: "google",
            clientId: "test-client",
            clientSecret: "test-secret",
            authorizationUrl: "https://provider.example/authorize",
            tokenUrl: "https://provider.example/token",
            getToken: async () => ({ accessToken: "test-access-token" }),
            getUserInfo: async () => ({
              id: "provider-user",
              name: "Test User",
              email: "user@example.com",
              emailVerified: true,
            }),
          },
        ],
      }),
    ],
    hooks: { after: createAuthMiddleware(mobileAuthProviderCompletion) },
    rateLimit: { enabled: false },
  });
}

async function startFlow(proxy = false) {
  const auth = createTestAuth("https://app.example", proxy);
  const callbackURL =
    "https://app.example/api/mobile-auth/callback?state=state-1234567890&completion=completion-secret";
  const start = await auth.handler(
    new Request("https://app.example/api/auth/sign-in/social", {
      method: "POST",
      headers: {
        origin: "https://app.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        provider: "google",
        callbackURL,
        disableRedirect: true,
      }),
    }),
  );
  const body = await start.clone().json();
  return {
    auth,
    start,
    callbackURL,
    cookie: cookies(start),
    providerState: new URL(body.url).searchParams.get("state")!,
  };
}

function cookies(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
