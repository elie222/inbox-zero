import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  parseRedirect,
  signInWithChatGpt,
  validateIdTokenClaims,
} from "./chatgpt-auth";

const CANCEL = Symbol("cancel");
const prompts = vi.hoisted(() => ({
  pastedValue: null as string | null,
}));

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({ on: () => ({ unref: () => {} }) })),
}));

vi.mock("@clack/prompts", () => ({
  log: { info: vi.fn(), warn: vi.fn(), success: vi.fn(), error: vi.fn() },
  cancel: vi.fn(),
  isCancel: (value: unknown) => value === CANCEL,
  // Resolves with a pasted value, or with "cancel" once the browser callback
  // aborts the prompt.
  text: vi.fn(
    ({ signal }: { signal?: AbortSignal }) =>
      new Promise((resolve) => {
        if (prompts.pastedValue) {
          resolve(prompts.pastedValue);
          return;
        }
        signal?.addEventListener("abort", () => resolve(CANCEL));
      }),
  ),
}));

const realFetch = globalThis.fetch;
const tokenEndpoint = vi.fn();

beforeEach(() => {
  prompts.pastedValue = null;
  tokenEndpoint.mockReset();
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).startsWith("https://auth.openai.com")
      ? tokenEndpoint(input, init)
      : realFetch(input, init),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signInWithChatGpt", () => {
  it("completes registration through the loopback callback", async () => {
    let authorizeUrl = "";
    const { log } = await import("@clack/prompts");
    vi.mocked(log.info).mockImplementation((message: string) => {
      authorizeUrl = message.slice(message.indexOf("https://"));
    });
    tokenEndpoint.mockImplementation(async (_url, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      return Response.json({
        access_token: "access",
        refresh_token: "refresh-from-setup",
        id_token: idToken({
          aud: "oaiapp_new",
          nonce: nonceFrom(authorizeUrl),
        }),
        scope:
          "openid email offline_access resource.invoke chatgpt.tokens.use.direct",
        expires_in: 3600,
        received: Object.fromEntries(body),
      });
    });

    const signIn = signInWithChatGpt({ hostId: "urn:uuid:host" });
    await vi.waitFor(() => expect(authorizeUrl).not.toBe(""));
    const authorize = new URL(authorizeUrl).searchParams;

    // The browser follows OpenAI's redirect back to the CLI.
    const callback = new URL(authorize.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "auth-code");
    callback.searchParams.set("state", authorize.get("state") ?? "");
    callback.searchParams.set("client_id", "oaiapp_new");
    await realFetch(callback);

    await expect(signIn).resolves.toEqual({
      clientId: "oaiapp_new",
      hostId: "urn:uuid:host",
      refreshToken: "refresh-from-setup",
      email: "owner@example.com",
    });
    const exchange = new URLSearchParams(
      String(tokenEndpoint.mock.calls[0][1].body),
    );
    expect(exchange.get("client_id")).toBe("oaiapp_new");
    expect(exchange.get("code")).toBe("auth-code");
    expect(exchange.get("redirect_uri")).toBe(authorize.get("redirect_uri"));
    expect(
      createHash("sha256")
        .update(exchange.get("code_verifier") ?? "")
        .digest("base64url"),
    ).toBe(authorize.get("code_challenge"));
  });

  it("rejects a pasted redirect from a different sign-in attempt", async () => {
    prompts.pastedValue =
      "http://127.0.0.1:1455/auth/callback?code=c&state=someone-elses&client_id=oaiapp_x";

    await expect(signInWithChatGpt()).rejects.toThrow("state mismatch");
    expect(tokenEndpoint).not.toHaveBeenCalled();
  });

  it("refuses a sign-in that did not allow plan usage", async () => {
    let authorizeUrl = "";
    const { log } = await import("@clack/prompts");
    vi.mocked(log.info).mockImplementation((message: string) => {
      authorizeUrl = message.slice(message.indexOf("https://"));
    });
    tokenEndpoint.mockImplementation(async () =>
      Response.json({
        access_token: "access",
        refresh_token: "refresh",
        id_token: idToken({
          aud: "oaiapp_new",
          nonce: nonceFrom(authorizeUrl),
        }),
        scope: "openid email offline_access",
      }),
    );

    const signIn = expect(signInWithChatGpt()).rejects.toThrow(
      "plan usage was not allowed",
    );
    await vi.waitFor(() => expect(authorizeUrl).not.toBe(""));
    const authorize = new URL(authorizeUrl).searchParams;
    const callback = new URL(authorize.get("redirect_uri") ?? "");
    callback.searchParams.set("code", "auth-code");
    callback.searchParams.set("state", authorize.get("state") ?? "");
    callback.searchParams.set("client_id", "oaiapp_new");
    await realFetch(callback);

    await signIn;
  });
});

describe("buildAuthorizeUrl", () => {
  it("only sends the registration name hint for a new registration", () => {
    const base = {
      hostId: "urn:uuid:host",
      redirectUri: "http://127.0.0.1:1455/auth/callback",
      state: "s",
      nonce: "n",
      codeVerifier: "v",
    };

    const first = new URL(buildAuthorizeUrl({ ...base, clientId: null }));
    const again = new URL(buildAuthorizeUrl({ ...base, clientId: "oaiapp_1" }));

    expect(first.searchParams.get("client_id")).toBe("dynamic_agent_client");
    expect(first.searchParams.get("agent_name_hint")).toBe("Inbox Zero");
    expect(again.searchParams.get("client_id")).toBe("oaiapp_1");
    expect(again.searchParams.has("agent_name_hint")).toBe(false);
  });
});

describe("parseRedirect", () => {
  it("reads the code, state, and issued client from a pasted address", () => {
    expect(
      parseRedirect(
        " http://127.0.0.1:1455/auth/callback?code=abc&state=xyz&client_id=oaiapp_1 ",
      ),
    ).toEqual({ code: "abc", state: "xyz", clientId: "oaiapp_1", error: null });
    expect(parseRedirect("not a url")).toBeNull();
  });
});

describe("validateIdTokenClaims", () => {
  it("accepts a token issued to this client for this attempt", () => {
    expect(
      validateIdTokenClaims({
        idToken: idToken({ aud: "oaiapp_1", nonce: "n" }),
        clientId: "oaiapp_1",
        nonce: "n",
      }),
    ).toEqual({ email: "owner@example.com" });
  });

  it("rejects tokens for another client, attempt, issuer, or that expired", () => {
    const check = (claims: Record<string, unknown>) => () =>
      validateIdTokenClaims({
        idToken: idToken({ aud: "oaiapp_1", nonce: "n", ...claims }),
        clientId: "oaiapp_1",
        nonce: "n",
      });

    expect(check({ aud: "oaiapp_other" })).toThrow("invalid ID token");
    expect(check({ nonce: "replayed" })).toThrow("invalid ID token");
    expect(check({ iss: "https://evil.example" })).toThrow("invalid ID token");
    expect(check({ exp: 1 })).toThrow("invalid ID token");
  });
});

function idToken(claims: Record<string, unknown>) {
  const payload = {
    iss: "https://auth.openai.com",
    sub: "user-1",
    email: "owner@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  };
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode(payload)}.signature`;
}

function nonceFrom(authorizeUrl: string) {
  return new URL(authorizeUrl).searchParams.get("nonce");
}
