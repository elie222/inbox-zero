import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createMobileAuthStateMock,
  handlerMock,
  mockEnv,
  storeMobileAuthStateMock,
} = vi.hoisted(() => ({
  createMobileAuthStateMock: vi.fn(),
  handlerMock: vi.fn(),
  mockEnv: {
    DESKTOP_AUTH_ORIGIN: "inboxzero://",
    MOBILE_AUTH_ORIGIN: "inboxzero://",
    NEXT_PUBLIC_BASE_URL: "https://www.getinboxzero.com",
  },
  storeMobileAuthStateMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

vi.mock("@/utils/auth", () => ({
  betterAuthConfig: {
    handler: handlerMock,
  },
}));

vi.mock("@/utils/mobile-auth/oauth-code", () => ({
  createMobileAuthState: createMobileAuthStateMock,
  storeMobileAuthState: storeMobileAuthStateMock,
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware({ handleSafeErrors: true });
});

import { GET } from "./route";

describe("mobile auth browser-start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.DESKTOP_AUTH_ORIGIN = "inboxzero://";
    mockEnv.NEXT_PUBLIC_BASE_URL = "https://www.getinboxzero.com";
    createMobileAuthStateMock.mockReturnValue("state-1234567890");
    storeMobileAuthStateMock.mockResolvedValue(undefined);
    handlerMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          redirect: false,
          url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=client",
        }),
        {
          headers: {
            "content-type": "application/json",
            "set-cookie":
              "__Secure-better-auth.oauth_state=encrypted-oauth-state; Path=/; HttpOnly; Secure; SameSite=Lax",
          },
          status: 200,
        },
      ),
    );
  });

  it("starts desktop OAuth in the current browser and copies the OAuth state cookie", async () => {
    const response = await GET(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/browser-start?provider=google",
      ),
      {} as never,
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?client_id=client",
    );
    expect(response.headers.get("set-cookie")).toContain(
      "__Secure-better-auth.oauth_state=encrypted-oauth-state",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(storeMobileAuthStateMock).toHaveBeenCalledWith({
      returnUrlMode: "desktop-scheme",
      state: "state-1234567890",
    });
    const [signInRequest] = handlerMock.mock.calls[0] as [Request];
    await expect(signInRequest.json()).resolves.toEqual({
      provider: "google",
      callbackURL:
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      errorCallbackURL:
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      newUserCallbackURL:
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      disableRedirect: true,
    });
  });

  it("rejects unknown providers", async () => {
    await expect(
      GET(
        new NextRequest(
          "https://www.getinboxzero.com/api/mobile-auth/browser-start?provider=okta",
        ),
        {} as never,
      ),
    ).rejects.toThrow(/Invalid option/);
    expect(handlerMock).not.toHaveBeenCalled();
  });
});
