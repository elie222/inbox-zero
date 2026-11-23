import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSignedOAuthState } from "@/utils/oauth/state";
import { validateOAuthCallback } from "@/utils/oauth/callback-validation";
import { createTestLogger } from "@/__tests__/helpers";
import { GET } from "./route";

const {
  mockAuth,
  mockActiveUser,
  mockReconnect,
  mockGoogleUrl,
  mockMicrosoftUrl,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockActiveUser: vi.fn(),
  mockReconnect: vi.fn(),
  mockGoogleUrl: vi.fn(
    (options: { state: string }) =>
      `https://accounts.google.com/o/oauth2/v2/auth?state=${options.state}`,
  ),
  mockMicrosoftUrl: vi.fn(
    () =>
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=configured-client",
  ),
}));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-auth-secret",
    NEXT_PUBLIC_BASE_URL: "https://www.getinboxzero.com",
    NODE_ENV: "production",
  },
}));
vi.mock("@/utils/auth", () => ({ auth: mockAuth }));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");
  return createWithErrorTestMiddleware();
});
vi.mock("@/utils/oauth/account-linking", () => ({
  hasActiveAccountLinkingUser: mockActiveUser,
}));
vi.mock("@/utils/oauth/reconnect-target", () => ({
  findReconnectTarget: mockReconnect,
}));
vi.mock("@/utils/gmail/client", () => ({
  getLinkingOAuth2Client: () => ({ generateAuthUrl: mockGoogleUrl }),
}));
vi.mock("@/utils/outlook/client", () => ({
  getLinkingOAuth2Url: mockMicrosoftUrl,
}));
vi.mock("@/utils/prisma");

describe("account linking browser handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "user-1" } });
    mockActiveUser.mockResolvedValue(true);
    mockReconnect.mockResolvedValue({
      id: "mailbox-1",
      email: "mailbox@example.com",
    });
  });

  it.each([
    "google",
    "microsoft",
  ] as const)("sets the %s cookie in a fresh browser before OAuth", async (provider) => {
    const state = makeState({ provider });
    const request = makeRequest(provider, state);
    expect(request.cookies.get("google_linking_state")).toBeUndefined();
    const response = await GET(request, {} as never);
    expect(response.status).toBe(302);
    const cookieName =
      provider === "google" ? "google_linking_state" : "outlook_linking_state";
    const cookie = response.cookies.get(cookieName);
    expect(cookie?.value).toBe(state);
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    const authorization = new URL(response.headers.get("location")!);
    expect(authorization.hostname).toBe(
      provider === "google"
        ? "accounts.google.com"
        : "login.microsoftonline.com",
    );
    expect(authorization.searchParams.get("state")).toBe(state);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(
      validateOAuthCallback({
        code: "provider-code",
        receivedState: authorization.searchParams.get("state"),
        storedState: cookie?.value,
        stateCookieName: cookieName,
        logger: createTestLogger(),
      }),
    ).toMatchObject({ success: true, targetUserId: "user-1" });
  });

  it("requires browser login and preserves the handoff for afterward", async () => {
    mockAuth.mockResolvedValue(null);
    const request = makeRequest("google", makeState());
    const response = await GET(request, {} as never);
    const login = new URL(response.headers.get("location")!);
    expect(login.pathname).toBe("/login");
    expect(login.searchParams.get("next")).toBe(
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("refuses a browser signed into a different profile", async () => {
    mockAuth.mockResolvedValue({ user: { id: "another-user" } });
    await expectRejected(makeState());
  });

  it("refuses a deleted or disabled target user", async () => {
    mockActiveUser.mockResolvedValue(false);
    await expectRejected(makeState());
  });

  it.each([
    { type: "calendar" },
    { provider: "microsoft" },
    { issuedAt: Date.now() - 11 * 60 * 1000 },
  ])("refuses expired or differently scoped signed states: %j", async (payload) => {
    await expectRejected(makeState(payload));
  });

  it("refuses tampered state", async () => {
    await expectRejected(`${makeState()}tampered`);
  });

  it.each([
    "google",
    "microsoft",
  ] as const)("keeps %s reconnects constrained to the original mailbox", async (provider) => {
    const state = makeState({ provider, reconnectEmailAccountId: "mailbox-1" });
    const response = await GET(makeRequest(provider, state), {} as never);
    expect(response.status).toBe(302);
    expect(mockReconnect).toHaveBeenCalledWith({
      emailAccountId: "mailbox-1",
      userId: "user-1",
      provider,
    });
    if (provider === "google")
      expect(mockGoogleUrl).toHaveBeenCalledWith(
        expect.objectContaining({ login_hint: "mailbox@example.com" }),
      );
    else
      expect(mockMicrosoftUrl).toHaveBeenCalledWith({
        loginHint: "mailbox@example.com",
      });
  });

  it("refuses a reconnect whose mailbox no longer belongs to the user", async () => {
    mockReconnect.mockResolvedValue(null);
    await expectRejected(makeState({ reconnectEmailAccountId: "mailbox-1" }));
  });
});

function makeState(data: Record<string, unknown> = {}) {
  return generateSignedOAuthState({
    type: "account-linking",
    provider: "google",
    userId: "user-1",
    ...data,
  });
}

function makeRequest(provider: string, state: string) {
  const url = new URL(
    "https://www.getinboxzero.com/api/oauth/linking/browser-start",
  );
  url.searchParams.set("provider", provider);
  url.searchParams.set("state", state);
  return new NextRequest(url);
}

async function expectRejected(state: string) {
  const response = await GET(makeRequest("google", state), {} as never);
  expect(
    new URL(response.headers.get("location")!).searchParams.get("error"),
  ).toBe("invalid_state");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(mockGoogleUrl).not.toHaveBeenCalled();
  expect(mockMicrosoftUrl).not.toHaveBeenCalled();
}
