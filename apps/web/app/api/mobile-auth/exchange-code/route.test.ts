import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  buildMobileSessionCookieMock,
  consumeMobileAuthCodeMock,
  createSessionMock,
} = vi.hoisted(() => ({
  buildMobileSessionCookieMock: vi.fn(),
  consumeMobileAuthCodeMock: vi.fn(),
  createSessionMock: vi.fn(),
}));

vi.mock("@/utils/auth", () => ({
  betterAuthConfig: {
    $context: Promise.resolve({
      internalAdapter: {
        createSession: createSessionMock,
      },
    }),
  },
}));

vi.mock("@/utils/mobile-auth/oauth-code", () => ({
  consumeMobileAuthCode: consumeMobileAuthCodeMock,
}));

vi.mock("@/utils/mobile-auth/session-cookie", () => ({
  buildMobileSessionCookie: buildMobileSessionCookieMock,
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware({ handleSafeErrors: true });
});

import { POST } from "./route";

describe("mobile auth exchange-code route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consumeMobileAuthCodeMock.mockResolvedValue({ userId: "user-1" });
    createSessionMock.mockResolvedValue({
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      token: "session-token",
    });
    buildMobileSessionCookieMock.mockResolvedValue({
      name: "__Secure-better-auth.session_token",
      options: {
        expires: new Date("2026-05-01T00:00:00.000Z"),
        httpOnly: true,
        path: "/",
        sameSite: "lax",
        secure: true,
      },
      value: "signed-session-token",
    });
  });

  it("exchanges a one-time code for a mobile session cookie", async () => {
    const response = await POST(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/exchange-code",
        {
          body: JSON.stringify({
            code: "one-time-code",
            state: "state-1234567890",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      ),
      {} as never,
    );
    const body = await response.json();

    expect(consumeMobileAuthCodeMock).toHaveBeenCalledWith({
      code: "one-time-code",
      state: "state-1234567890",
    });
    expect(createSessionMock).toHaveBeenCalledWith("user-1", false, {});
    expect(buildMobileSessionCookieMock).toHaveBeenCalledWith({
      authContext: expect.objectContaining({
        internalAdapter: expect.any(Object),
      }),
      expiresAt: new Date("2026-05-01T00:00:00.000Z"),
      sessionToken: "session-token",
    });
    expect(body).toEqual({ success: true });
    expect(body.setCookie).toBeUndefined();
    expect(response.headers.get("set-cookie")).toContain(
      "__Secure-better-auth.session_token=signed-session-token",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a known error when the code is invalid", async () => {
    const error = new Error(
      "Invalid or expired authentication code",
    ) as Error & {
      safeMessage?: string;
      statusCode?: number;
    };
    error.name = "SafeError";
    error.safeMessage = "Invalid or expired authentication code";
    error.statusCode = 401;
    consumeMobileAuthCodeMock.mockRejectedValue(error);

    const response = await POST(
      new NextRequest(
        "https://www.getinboxzero.com/api/mobile-auth/exchange-code",
        {
          body: JSON.stringify({
            code: "one-time-code",
            state: "state-1234567890",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      ),
      {} as never,
    );

    await expect(response.json()).resolves.toEqual({
      error: "Invalid or expired authentication code",
      isKnownError: true,
    });
    expect(response.status).toBe(401);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
