import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthState,
  mockGenerateAuthUrl,
  mockGetLinkingOAuth2Url,
  mockHasActiveAccountLinkingUser,
  mockFindReconnectTarget,
} = vi.hoisted(() => ({
  mockAuthState: { userId: "user-1" } as { userId: string; emailOtp?: boolean },
  mockGenerateAuthUrl: vi.fn(
    ({ state }: { state: string }) =>
      `https://accounts.google.com/o/oauth2/auth?state=${state}`,
  ),
  mockGetLinkingOAuth2Url: vi.fn(
    () => "https://login.microsoftonline.com/authorize?prompt=consent",
  ),
  mockHasActiveAccountLinkingUser: vi.fn(),
  mockFindReconnectTarget: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-auth-secret",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithAuthTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAuthTestMiddleware({ auth: mockAuthState });
});

vi.mock("@/utils/gmail/client", () => ({
  getLinkingOAuth2Client: vi.fn(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
  })),
}));

vi.mock("@/utils/outlook/client", () => ({
  getLinkingOAuth2Url: mockGetLinkingOAuth2Url,
}));

vi.mock("@/utils/oauth/account-linking", async (importActual) => {
  const actual =
    await importActual<typeof import("@/utils/oauth/account-linking")>();
  return {
    getMailboxLinkingBlockedResponse: actual.getMailboxLinkingBlockedResponse,
    hasActiveAccountLinkingUser: mockHasActiveAccountLinkingUser,
  };
});

vi.mock("@/utils/oauth/reconnect-target", () => ({
  findReconnectTarget: mockFindReconnectTarget,
}));

import { parseDesktopLinkingState } from "@/utils/oauth/desktop-account-linking";
import { POST } from "./route";

const CODE_CHALLENGE = "c".repeat(43);

describe("desktop account link start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.emailOtp = undefined;
    mockHasActiveAccountLinkingUser.mockResolvedValue(true);
  });

  it("signs the session user and challenge into the state without setting a cookie", async () => {
    const response = await POST(
      createRequest({ provider: "google", codeChallenge: CODE_CHALLENGE }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();
    const { url } = await response.json();
    const state = new URL(url).searchParams.get("state");
    expect(parseDesktopLinkingState(state)).toMatchObject({
      userId: "user-1",
      desktop: true,
      codeChallenge: CODE_CHALLENGE,
    });
  });

  it("targets the reconnected mailbox", async () => {
    mockFindReconnectTarget.mockResolvedValue({
      id: "email-account-1",
      email: "user@example.com",
    });

    const response = await POST(
      createRequest({
        provider: "microsoft",
        codeChallenge: CODE_CHALLENGE,
        reconnectEmailAccountId: "email-account-1",
      }),
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(mockFindReconnectTarget).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      userId: "user-1",
      provider: "microsoft",
    });
    expect(mockGetLinkingOAuth2Url).toHaveBeenCalledWith({
      loginHint: "user@example.com",
    });
    const { url } = await response.json();
    expect(
      parseDesktopLinkingState(new URL(url).searchParams.get("state")),
    ).toMatchObject({ reconnectEmailAccountId: "email-account-1" });
  });

  it("refuses a reconnect target the user does not own", async () => {
    mockFindReconnectTarget.mockResolvedValue(null);

    const response = await POST(
      createRequest({
        provider: "google",
        codeChallenge: CODE_CHALLENGE,
        reconnectEmailAccountId: "someone-elses-account",
      }),
      {} as never,
    );

    expect(response.status).toBe(404);
    expect(mockGenerateAuthUrl).not.toHaveBeenCalled();
  });

  it("does not let an email code session start mailbox linking", async () => {
    mockAuthState.emailOtp = true;

    const response = await POST(
      createRequest({ provider: "google", codeChallenge: CODE_CHALLENGE }),
      {} as never,
    );

    expect(response.status).toBe(403);
    expect(mockGenerateAuthUrl).not.toHaveBeenCalled();
  });

  it("rejects a malformed code challenge", async () => {
    const response = await POST(
      createRequest({ provider: "google", codeChallenge: "short" }),
      {} as never,
    );

    expect(response.status).toBe(400);
    expect(mockGenerateAuthUrl).not.toHaveBeenCalled();
  });
});

function createRequest(body: Record<string, string>) {
  return new NextRequest(
    "http://localhost:3000/api/desktop-account-link/start",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
  );
}
