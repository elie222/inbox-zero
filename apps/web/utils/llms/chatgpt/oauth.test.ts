import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatGptTokenError,
  buildChatGptAuthorizationUrl,
  getChatGptRedirectUri,
  hasChatGptPlanScope,
  refreshChatGptToken,
} from "./oauth";

describe("getChatGptRedirectUri", () => {
  it("uses the 127.0.0.1 loopback callback on the app's port", () => {
    expect(getChatGptRedirectUri("http://localhost:3001")).toBe(
      "http://127.0.0.1:3001/auth/callback",
    );
    expect(getChatGptRedirectUri("http://127.0.0.1")).toBe(
      "http://127.0.0.1:80/auth/callback",
    );
  });

  it("is unavailable when the app is not served from this machine", () => {
    expect(getChatGptRedirectUri("https://mail.example.com")).toBeNull();
    expect(getChatGptRedirectUri("https://localhost:3000")).toBeNull();
  });
});

describe("buildChatGptAuthorizationUrl", () => {
  const base = {
    hostId: "urn:uuid:host",
    redirectUri: "http://127.0.0.1:3001/auth/callback",
    state: "state-value",
    codeVerifier: "verifier",
    nonce: "nonce-value",
  };

  it("registers a new client with plan usage scopes and PKCE", () => {
    const url = new URL(
      buildChatGptAuthorizationUrl({ ...base, clientId: null }),
    );
    const params = url.searchParams;

    expect(url.origin + url.pathname).toBe(
      "https://auth.openai.com/api/accounts/authorize",
    );
    expect(params.get("client_id")).toBe("dynamic_agent_client");
    expect(params.get("agent_name_hint")).toBe("Inbox Zero");
    expect(params.get("ext_agent_host_id")).toBe("urn:uuid:host");
    expect(params.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining([
        "offline_access",
        "resource.invoke",
        "chatgpt.tokens.use.direct",
      ]),
    );
    expect(params.get("resource")).toBe("https://api.openai.com/v1");
    expect(params.get("code_challenge")).toBe(
      createHash("sha256").update("verifier").digest("base64url"),
    );
  });

  it("reuses an issued client without the registration name hint", () => {
    const params = new URL(
      buildChatGptAuthorizationUrl({
        ...base,
        clientId: "oaiapp_123",
        idTokenHint: "old-id-token",
      }),
    ).searchParams;

    expect(params.get("client_id")).toBe("oaiapp_123");
    expect(params.has("agent_name_hint")).toBe(false);
    expect(params.get("id_token_hint")).toBe("old-id-token");
  });
});

describe("hasChatGptPlanScope", () => {
  it("requires the plan usage scope", () => {
    expect(hasChatGptPlanScope("openid email chatgpt.tokens.use.direct")).toBe(
      true,
    );
    expect(hasChatGptPlanScope("openid email")).toBe(false);
    expect(hasChatGptPlanScope(undefined)).toBe(false);
  });
});

describe("token requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // Renewal holds a short Redis lock; a request that outlived it would let a
  // second process spend the same single-use refresh token.
  it("gives up on a hung token endpoint as a temporary failure", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );

    const request = refreshChatGptToken({
      clientId: "oaiapp_1",
      refreshToken: "refresh-1",
    });
    const outcome = request.catch((error) => error);
    await vi.advanceTimersByTimeAsync(20_000);

    const error = await outcome;
    expect(error).toBeInstanceOf(ChatGptTokenError);
    expect(error.isTerminal).toBe(false);
  });
});
