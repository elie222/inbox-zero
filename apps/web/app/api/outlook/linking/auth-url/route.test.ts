import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthState,
  mockGetLinkingOAuth2Url,
  mockHasActiveAccountLinkingUser,
  mockFindReconnectTarget,
} = vi.hoisted(() => ({
  mockAuthState: { userId: "user-1" } as { userId: string; emailOtp?: boolean },
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

import { GET } from "./route";

describe("outlook linking auth-url route", () => {
  const createRequest = () =>
    new NextRequest("http://localhost:3000/api/outlook/linking/auth-url");

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.emailOtp = undefined;
    mockHasActiveAccountLinkingUser.mockResolvedValue(true);
  });

  it("returns an auth URL for a provider session", async () => {
    const response = await GET(createRequest(), {} as never);

    expect(response.status).toBe(200);
    const body = (await response.json()) as { url: string };
    expect(body.url).toContain("https://login.microsoftonline.com/authorize");
  });

  it("does not let an email code session start mailbox linking", async () => {
    mockAuthState.emailOtp = true;

    const response = await GET(createRequest(), {} as never);

    expect(response.status).toBe(403);
    expect(mockGetLinkingOAuth2Url).not.toHaveBeenCalled();
    expect(response.cookies.get("outlook_linking_state")).toBeUndefined();
  });
});
