import { describe, expect, it } from "vitest";
import { isAllowedExpoAuthorizationUrl, safeExpo } from "./expo";

describe("safe Expo Better Auth plugin", () => {
  it("does not install the stock cookie-in-callback redirect hook", () => {
    expect(safeExpo()).not.toHaveProperty("hooks.after");
  });

  it("copies expo-origin into origin for mobile Better Auth requests", async () => {
    const plugin = safeExpo();
    const request = new Request(
      "https://www.getinboxzero.com/api/auth/session",
      {
        headers: {
          "expo-origin": "inboxzero://",
        },
      },
    );

    const result = await plugin.onRequest(request);

    expect(result?.request.headers.get("origin")).toBe("inboxzero://");
  });

  it("keeps the Expo authorization proxy path", () => {
    expect(safeExpo().endpoints.expoAuthorizationProxy.path).toBe(
      "/expo-authorization-proxy",
    );
  });
});

describe("Expo authorization URL allowlist", () => {
  const baseURL = "http://localhost:3001";

  it("allows the local emulator only when local http is enabled", () => {
    for (const emulator of [
      "http://localhost:3003/o/oauth2/v2/auth",
      "http://127.0.0.1:3003/o/oauth2/v2/auth",
      "http://google.localhost:3003/o/oauth2/v2/auth",
    ]) {
      const url = new URL(emulator);
      expect(isAllowedExpoAuthorizationUrl(url, baseURL, true)).toBe(true);
      expect(isAllowedExpoAuthorizationUrl(url, baseURL, false)).toBe(false);
    }
  });

  it("allows the mobile providers and rejects every other host", () => {
    for (const provider of [
      "https://accounts.google.com/o/oauth2/v2/auth",
      "https://appleid.apple.com/auth/authorize",
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    ]) {
      expect(
        isAllowedExpoAuthorizationUrl(new URL(provider), baseURL, false),
      ).toBe(true);
    }
    for (const rejected of [
      "https://evil.example/o/oauth2/v2/auth",
      "https://accounts.google.com.evil.example/o/oauth2/v2/auth",
      `${baseURL}/api/auth`,
      "http://evil.example/o/oauth2/v2/auth",
    ]) {
      expect(
        isAllowedExpoAuthorizationUrl(new URL(rejected), baseURL, true),
      ).toBe(false);
    }
  });
});
