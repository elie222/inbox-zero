import { betterAuth } from "better-auth";
import { describe, expect, it } from "vitest";
import {
  isAllowedNativeAuthorizationUrl,
  nativeAuthPlugin,
} from "./native-auth-plugin";

describe("native auth Better Auth plugin", () => {
  it("copies expo-origin into origin for native client requests", async () => {
    const request = new Request(
      "https://www.getinboxzero.com/api/auth/session",
      { headers: { "expo-origin": "inboxzero://" } },
    );

    const result = await nativeAuthPlugin().onRequest(request);

    expect(result?.request.headers.get("origin")).toBe("inboxzero://");
  });

  it("keeps an origin the request already has", async () => {
    const request = new Request(
      "https://www.getinboxzero.com/api/auth/session",
      {
        headers: {
          origin: "https://www.getinboxzero.com",
          "expo-origin": "inboxzero://",
        },
      },
    );

    expect(await nativeAuthPlugin().onRequest(request)).toBeUndefined();
  });

  it("keeps the authorization proxy path the native clients call", () => {
    expect(nativeAuthPlugin().endpoints.nativeAuthorizationProxy.path).toBe(
      "/expo-authorization-proxy",
    );
  });
});

describe("native authorization proxy endpoint", () => {
  const baseURL = "https://app.example";
  const auth = betterAuth({
    baseURL,
    secret: "test-secret-that-is-long-enough-for-better-auth",
    plugins: [nativeAuthPlugin()],
  });
  const googleUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=abc";

  function callProxy(query: Record<string, string>) {
    const params = new URLSearchParams(query);
    return auth.handler(
      new Request(`${baseURL}/api/auth/expo-authorization-proxy?${params}`),
    );
  }

  it("rejects a request without oauthState and sets no cookie", async () => {
    const response = await callProxy({ authorizationURL: googleUrl });

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("stores oauthState and redirects to an allowed provider", async () => {
    const response = await callProxy({
      authorizationURL: googleUrl,
      oauthState: "encrypted-state",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(googleUrl);
    expect(response.headers.get("set-cookie")).toContain(
      "oauth_state=encrypted-state",
    );
  });

  it("rejects a provider host outside the allowlist", async () => {
    const response = await callProxy({
      authorizationURL: "https://evil.example/o/oauth2/v2/auth?state=abc",
      oauthState: "encrypted-state",
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});

describe("native authorization URL allowlist", () => {
  const baseURL = "http://localhost:3001";

  it("allows the local emulator only when local http is enabled", () => {
    for (const emulator of [
      "http://localhost:3003/o/oauth2/v2/auth",
      "http://127.0.0.1:3003/o/oauth2/v2/auth",
      "http://google.localhost:3003/o/oauth2/v2/auth",
    ]) {
      const url = new URL(emulator);
      expect(isAllowedNativeAuthorizationUrl(url, baseURL, true)).toBe(true);
      expect(isAllowedNativeAuthorizationUrl(url, baseURL, false)).toBe(false);
    }
  });

  it("allows the mobile providers and rejects every other host", () => {
    for (const provider of [
      "https://accounts.google.com/o/oauth2/v2/auth",
      "https://appleid.apple.com/auth/authorize",
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    ]) {
      expect(
        isAllowedNativeAuthorizationUrl(new URL(provider), baseURL, false),
      ).toBe(true);
    }
    for (const rejected of [
      "https://evil.example/o/oauth2/v2/auth",
      "https://accounts.google.com.evil.example/o/oauth2/v2/auth",
      `${baseURL}/api/auth`,
      "http://evil.example/o/oauth2/v2/auth",
    ]) {
      expect(
        isAllowedNativeAuthorizationUrl(new URL(rejected), baseURL, true),
      ).toBe(false);
    }
  });

  it("allows only the configured emulator origins", () => {
    const google = new URL("https://mail.example:8443/o/oauth2/v2/auth");
    const microsoft = new URL(
      "https://mail.example:8444/common/oauth2/v2.0/authorize",
    );
    const origins = [
      "https://mail.example:8443",
      "https://mail.example:8444",
      "http://evil.example:3003",
    ];
    expect(
      isAllowedNativeAuthorizationUrl(google, baseURL, false, origins),
    ).toBe(true);
    expect(
      isAllowedNativeAuthorizationUrl(microsoft, baseURL, false, origins),
    ).toBe(true);
    expect(
      isAllowedNativeAuthorizationUrl(
        new URL("http://evil.example:3003/o/oauth2/v2/auth"),
        baseURL,
        true,
        origins,
      ),
    ).toBe(false);
    expect(isAllowedNativeAuthorizationUrl(google, baseURL, false)).toBe(false);
  });
});
