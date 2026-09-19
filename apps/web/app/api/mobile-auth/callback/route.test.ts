import { SafeError } from "@/utils/error";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  consumeMobileAuthStateMock,
  consumeMobileAuthFailureStateMock,
  createMobileAuthCodeMock,
  mockEnv,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  consumeMobileAuthStateMock: vi.fn(),
  consumeMobileAuthFailureStateMock: vi.fn(),
  createMobileAuthCodeMock: vi.fn(),
  mockEnv: {
    DESKTOP_AUTH_ORIGIN: "inboxzero://",
    MOBILE_AUTH_ORIGIN: "inboxzero://",
    NEXT_PUBLIC_BASE_URL: "https://www.getinboxzero.com",
  },
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

vi.mock("@/utils/auth", () => ({
  auth: authMock,
}));

vi.mock("@/utils/mobile-auth/oauth-code", async () => {
  const actual = await vi.importActual<
    typeof import("@/utils/mobile-auth/oauth-code")
  >("@/utils/mobile-auth/oauth-code");
  return {
    isValidMobileAuthState: actual.isValidMobileAuthState,
    consumeMobileAuthState: consumeMobileAuthStateMock,
    consumeMobileAuthFailureState: consumeMobileAuthFailureStateMock,
    createMobileAuthCode: createMobileAuthCodeMock,
  };
});

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware({ handleSafeErrors: true });
});

import { GET } from "./route";

describe("mobile auth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.MOBILE_AUTH_ORIGIN = "inboxzero://";
    mockEnv.NEXT_PUBLIC_BASE_URL = "https://www.getinboxzero.com";
    authMock.mockResolvedValue({
      user: { id: "user-1" },
      session: { emailOtp: false, token: "session-token" },
    });
    consumeMobileAuthStateMock.mockResolvedValue({
      returnUrlMode: "app-link",
      codeChallenge: "a".repeat(43),
    });
    createMobileAuthCodeMock.mockResolvedValue("one-time-code");
  });

  it("does not turn a code-based session into an unrestricted app session", async () => {
    authMock.mockResolvedValue({
      user: { id: "user-1" },
      session: { emailOtp: true, token: "session-token" },
    });
    const response = await GET(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      ),
      {} as never,
    );
    expect(response.status).toBe(403);
    expect(createMobileAuthCodeMock).not.toHaveBeenCalled();
  });

  it("does not mint a code for an ambient session without completed state", async () => {
    consumeMobileAuthStateMock.mockRejectedValue(
      new SafeError("Invalid authentication state", 401),
    );
    const response = await GET(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      ),
      {} as never,
    );
    expect(response.status).toBe(401);
    expect(createMobileAuthCodeMock).not.toHaveBeenCalled();
  });

  it("returns provider failures to the initiating app without minting a code", async () => {
    consumeMobileAuthFailureStateMock.mockResolvedValue({
      returnUrlMode: "custom-scheme",
    });
    const response = await GET(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890&error=access_denied",
      ),
      {} as never,
    );
    const location = new URL(response.headers.get("location")!);
    expect(location.protocol).toBe("inboxzero:");
    expect(location.searchParams.get("error")).toBe("authentication_failed");
    expect(createMobileAuthCodeMock).not.toHaveBeenCalled();
    expect(authMock).not.toHaveBeenCalled();
  });

  it("redirects HTTPS app links with a one-time code and state", async () => {
    const response = await GET(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      ),
      {} as never,
    );

    expect(authMock).toHaveBeenCalledWith(expect.any(Headers));
    expect(consumeMobileAuthStateMock).toHaveBeenCalledWith({
      state: "state-1234567890",
      sessionToken: "session-token",
    });
    expect(createMobileAuthCodeMock).toHaveBeenCalledWith({
      state: "state-1234567890",
      userId: "user-1",
      codeChallenge: "a".repeat(43),
    });
    expect(response.headers.get("location")).toBe(
      "https://www.getinboxzero.com/auth-callback?state=state-1234567890&code=one-time-code",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("redirects to the local custom scheme for non-HTTPS development origins", async () => {
    mockEnv.NEXT_PUBLIC_BASE_URL = "http://localhost:3000";

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/mobile-auth/callback?state=state-1234567890",
      ),
      {} as never,
    );

    expect(response.headers.get("location")).toBe(
      "inboxzero://auth-callback?state=state-1234567890&code=one-time-code",
    );
  });

  it("redirects to the stored custom scheme mode", async () => {
    consumeMobileAuthStateMock.mockResolvedValue({
      returnUrlMode: "custom-scheme",
    });

    const response = await GET(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      ),
      {} as never,
    );

    expect(response.headers.get("location")).toBe(
      "inboxzero://auth-callback?state=state-1234567890&code=one-time-code",
    );
  });

  it("redirects to the stored desktop scheme mode", async () => {
    consumeMobileAuthStateMock.mockResolvedValue({
      returnUrlMode: "desktop-scheme",
    });

    const response = await GET(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      ),
      {} as never,
    );

    expect(response.headers.get("location")).toBe(
      "inboxzero://auth-callback?state=state-1234567890&code=one-time-code",
    );
  });

  it("ignores tampered return URL modes on callback URLs", async () => {
    consumeMobileAuthStateMock.mockResolvedValue({
      returnUrlMode: "app-link",
      codeChallenge: "a".repeat(43),
    });

    const response = await GET(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890&returnUrlMode=custom-scheme",
      ),
      {} as never,
    );

    expect(response.headers.get("location")).toBe(
      "https://www.getinboxzero.com/auth-callback?state=state-1234567890&code=one-time-code",
    );
  });

  it("redirects auth errors without minting a code when the web session is missing", async () => {
    authMock.mockResolvedValue(null);

    const response = await GET(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/callback?state=state-1234567890",
      ),
      {} as never,
    );

    expect(createMobileAuthCodeMock).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect(consumeMobileAuthStateMock).not.toHaveBeenCalled();
  });
});
