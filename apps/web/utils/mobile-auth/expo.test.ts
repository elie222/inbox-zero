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
    const emulator = new URL("http://localhost:3003/o/oauth2/v2/auth");
    expect(isAllowedExpoAuthorizationUrl(emulator, baseURL, true)).toBe(true);
    expect(isAllowedExpoAuthorizationUrl(emulator, baseURL, false)).toBe(false);
  });

  it("allows https providers and rejects same-origin or other http hosts", () => {
    expect(
      isAllowedExpoAuthorizationUrl(
        new URL("https://accounts.google.com/o/oauth2/v2/auth"),
        baseURL,
        false,
      ),
    ).toBe(true);
    expect(
      isAllowedExpoAuthorizationUrl(
        new URL(`${baseURL}/api/auth`),
        baseURL,
        true,
      ),
    ).toBe(false);
    expect(
      isAllowedExpoAuthorizationUrl(
        new URL("http://evil.example/o/oauth2/v2/auth"),
        baseURL,
        true,
      ),
    ).toBe(false);
  });
});
