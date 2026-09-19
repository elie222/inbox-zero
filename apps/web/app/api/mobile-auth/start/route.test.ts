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

import { POST } from "./route";

describe("mobile auth start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.MOBILE_AUTH_ORIGIN = "inboxzero://";
    mockEnv.NEXT_PUBLIC_BASE_URL = "https://www.getinboxzero.com";
    createMobileAuthStateMock.mockReturnValue("state-1234567890");
    storeMobileAuthStateMock.mockResolvedValue(undefined);
    handlerMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          redirect: false,
          url: "https://accounts.google.com/o/oauth2/v2/auth?client_id=client&state=provider-state",
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

  it("rejects clients that omit codeChallenge", async () => {
    await expect(
      POST(
        new NextRequest("https://www.getinboxzero.com/api/mobile-auth/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ provider: "google" }),
        }),
        {} as never,
      ),
    ).rejects.toThrow();
    expect(handlerMock).not.toHaveBeenCalled();
  });

  it("starts mobile social auth with a server-generated state", async () => {
    const response = await POST(
      new NextRequest("https://www.getinboxzero.com/api/mobile-auth/start", {
        body: JSON.stringify({
          provider: "google",
          codeChallenge: "a".repeat(43),
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      {} as never,
    );

    await expect(response.json()).resolves.toEqual({
      authorizationURL:
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=client&state=provider-state",
      authSessionReturnUrl: "https://www.getinboxzero.com/auth-callback",
      oauthState: "encrypted-oauth-state",
      state: "state-1234567890",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(storeMobileAuthStateMock).toHaveBeenCalledWith({
      codeChallenge: "a".repeat(43),
      provider: "google",
      completionToken: "state-1234567890",
      returnUrlMode: "app-link",
      state: "state-1234567890",
    });
    expect(handlerMock).toHaveBeenCalledOnce();
    const [signInRequest] = handlerMock.mock.calls[0] as [Request];
    expect(signInRequest.url).toBe(
      "https://www.getinboxzero.com/api/auth/sign-in/social",
    );
    await expect(signInRequest.json()).resolves.toEqual({
      provider: "google",
      callbackURL:
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890&completion=state-1234567890",
      errorCallbackURL:
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      newUserCallbackURL:
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890&completion=state-1234567890",
      disableRedirect: true,
    });
  });

  it("returns a custom-scheme auth session return URL for local development", async () => {
    mockEnv.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";

    const response = await POST(
      new NextRequest("http://localhost:3000/api/mobile-auth/start", {
        body: JSON.stringify({
          provider: "microsoft",
          codeChallenge: "a".repeat(43),
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      {} as never,
    );

    await expect(response.json()).resolves.toEqual({
      authorizationURL:
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=client&state=provider-state",
      authSessionReturnUrl: "inboxzero://auth-callback",
      oauthState: "encrypted-oauth-state",
      state: "state-1234567890",
    });
    expect(handlerMock).toHaveBeenCalledOnce();
    expect(storeMobileAuthStateMock).toHaveBeenCalledWith({
      codeChallenge: "a".repeat(43),
      provider: "microsoft",
      completionToken: "state-1234567890",
      returnUrlMode: "app-link",
      state: "state-1234567890",
    });
    const [signInRequest] = handlerMock.mock.calls[0] as [Request];
    expect(signInRequest.url).toBe(
      "http://localhost:3000/api/auth/sign-in/social",
    );
    await expect(signInRequest.json()).resolves.toEqual(
      expect.objectContaining({
        callbackURL:
          "http://localhost:3000/api/mobile-auth/callback?state=state-1234567890&completion=state-1234567890",
        provider: "microsoft",
      }),
    );
  });

  it("starts mobile social auth with a custom-scheme return URL when requested", async () => {
    const response = await POST(
      new NextRequest("https://www.getinboxzero.com/api/mobile-auth/start", {
        body: JSON.stringify({
          provider: "google",
          codeChallenge: "a".repeat(43),
          returnUrlMode: "custom-scheme",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      {} as never,
    );

    await expect(response.json()).resolves.toEqual({
      authorizationURL:
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=client&state=provider-state",
      authSessionReturnUrl: "inboxzero://auth-callback",
      oauthState: "encrypted-oauth-state",
      state: "state-1234567890",
    });
    expect(handlerMock).toHaveBeenCalledOnce();
    expect(storeMobileAuthStateMock).toHaveBeenCalledWith({
      codeChallenge: "a".repeat(43),
      provider: "google",
      completionToken: "state-1234567890",
      returnUrlMode: "custom-scheme",
      state: "state-1234567890",
    });
    const [signInRequest] = handlerMock.mock.calls[0] as [Request];
    await expect(signInRequest.json()).resolves.toEqual({
      provider: "google",
      callbackURL:
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890&completion=state-1234567890",
      errorCallbackURL:
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      newUserCallbackURL:
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890&completion=state-1234567890",
      disableRedirect: true,
    });
  });

  it("returns a known error when Better Auth does not return a URL", async () => {
    handlerMock.mockResolvedValue(
      new Response(JSON.stringify({ redirect: false }), {
        headers: {
          "content-type": "application/json",
        },
        status: 200,
      }),
    );

    const response = await POST(
      new NextRequest("https://www.getinboxzero.com/api/mobile-auth/start", {
        body: JSON.stringify({
          provider: "google",
          codeChallenge: "a".repeat(43),
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      {} as never,
    );

    await expect(response.json()).resolves.toEqual({
      error: "Failed to start authentication",
      isKnownError: true,
    });
    expect(response.status).toBe(500);
    expect(storeMobileAuthStateMock).not.toHaveBeenCalled();
  });

  it("starts desktop social auth with a desktop-scheme return URL when requested", async () => {
    const response = await POST(
      new NextRequest("https://www.getinboxzero.com/api/mobile-auth/start", {
        body: JSON.stringify({
          provider: "google",
          codeChallenge: "a".repeat(43),
          returnUrlMode: "desktop-scheme",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      {} as never,
    );

    await expect(response.json()).resolves.toEqual({
      authorizationURL:
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=client&state=provider-state",
      authSessionReturnUrl: "inboxzero://auth-callback",
      oauthState: "encrypted-oauth-state",
      state: "state-1234567890",
    });
    expect(storeMobileAuthStateMock).toHaveBeenCalledWith({
      codeChallenge: "a".repeat(43),
      provider: "google",
      completionToken: "state-1234567890",
      returnUrlMode: "desktop-scheme",
      state: "state-1234567890",
    });
  });

  it("rejects non-http authorization URLs", async () => {
    handlerMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          redirect: false,
          url: "javascript:alert(1)",
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

    const response = await POST(
      new NextRequest("https://www.getinboxzero.com/api/mobile-auth/start", {
        body: JSON.stringify({
          provider: "google",
          codeChallenge: "a".repeat(43),
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      {} as never,
    );

    await expect(response.json()).resolves.toEqual({
      error: "Failed to start authentication",
      isKnownError: true,
    });
    expect(response.status).toBe(500);
    expect(storeMobileAuthStateMock).not.toHaveBeenCalled();
  });
});
