import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSignedOAuthState } from "@/utils/oauth/state";

const {
  mockAuthState,
  mockGenerateAuthUrl,
  mockHasActiveAccountLinkingUser,
  mockFindReconnectTarget,
} = vi.hoisted(() => ({
  mockAuthState: { userId: "user-1" } as { userId: string; emailOtp?: boolean },
  mockGenerateAuthUrl: vi.fn(() => "https://accounts.google.com/o/oauth2/auth"),
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

vi.mock("@/utils/oauth/account-linking", () => ({
  hasActiveAccountLinkingUser: mockHasActiveAccountLinkingUser,
}));

vi.mock("@/utils/oauth/reconnect-target", () => ({
  findReconnectTarget: mockFindReconnectTarget,
}));

import { GET } from "./route";

describe("google linking auth-url route", () => {
  const createRequest = () =>
    new NextRequest("http://localhost:3000/api/google/linking/auth-url");

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.emailOtp = undefined;
    mockHasActiveAccountLinkingUser.mockResolvedValue(true);
  });

  it("returns an auth URL for a provider session", async () => {
    const response = await GET(createRequest(), {} as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      url: "https://accounts.google.com/o/oauth2/auth",
    });
    const state = response.cookies.get("google_linking_state")?.value;
    expect(parseSignedOAuthState(state!)).toMatchObject({
      type: "account-linking",
      provider: "google",
      userId: "user-1",
    });
  });

  it("lets an email code session start mailbox linking", async () => {
    mockAuthState.emailOtp = true;

    const response = await GET(createRequest(), {} as never);

    expect(response.status).toBe(200);
    expect(mockGenerateAuthUrl).toHaveBeenCalled();
  });
});
