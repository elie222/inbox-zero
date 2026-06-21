import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  consumeMobileAuthStateMock,
  createMobileAuthCodeMock,
  mockEnv,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  consumeMobileAuthStateMock: vi.fn(),
  createMobileAuthCodeMock: vi.fn(),
  mockEnv: {
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
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    consumeMobileAuthStateMock.mockResolvedValue({ returnUrlMode: "app-link" });
    createMobileAuthCodeMock.mockResolvedValue("one-time-code");
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
    });
    expect(createMobileAuthCodeMock).toHaveBeenCalledWith({
      state: "state-1234567890",
      userId: "user-1",
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

  it("ignores tampered return URL modes on callback URLs", async () => {
    consumeMobileAuthStateMock.mockResolvedValue({ returnUrlMode: "app-link" });

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
    expect(response.headers.get("location")).toBe(
      "https://www.getinboxzero.com/auth-callback?state=state-1234567890&error=missing_session&error_description=Authentication+session+was+not+found",
    );
  });
});
