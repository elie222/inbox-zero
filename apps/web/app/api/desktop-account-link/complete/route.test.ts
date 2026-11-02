import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAuthState,
  mockLinkGoogleAccount,
  mockLinkMicrosoftAccount,
  redisStore,
} = vi.hoisted(() => ({
  mockAuthState: { userId: "user-1" } as { userId: string; emailOtp?: boolean },
  mockLinkGoogleAccount: vi.fn(),
  mockLinkMicrosoftAccount: vi.fn(),
  redisStore: new Map<string, unknown>(),
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

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(
      async (key: string, value: unknown, options?: { nx?: boolean }) => {
        if (options?.nx && redisStore.has(key)) return null;
        redisStore.set(key, value);
        return "OK";
      },
    ),
    getdel: vi.fn(async (key: string) => {
      const value = redisStore.get(key) ?? null;
      redisStore.delete(key);
      return value;
    }),
  },
}));

vi.mock("@/utils/gmail/link-account", () => ({
  linkGoogleAccount: mockLinkGoogleAccount,
}));

vi.mock("@/utils/outlook/link-account", () => ({
  linkMicrosoftAccount: mockLinkMicrosoftAccount,
}));

import { getMobileAuthCodeChallenge } from "@/utils/mobile-auth/pkce";
import { createAccountLinkingRedirect } from "@/utils/oauth/account-linking-redirect";
import { storeDesktopAccountLinkHandoff } from "@/utils/redis/desktop-account-link";
import { POST } from "./route";

const VERIFIER = "v".repeat(43);

describe("desktop account link complete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    mockAuthState.userId = "user-1";
    mockAuthState.emailOtp = undefined;
    mockLinkGoogleAccount.mockResolvedValue(
      createAccountLinkingRedirect({
        query: { success: "account_created_and_linked" },
      }),
    );
    mockLinkMicrosoftAccount.mockResolvedValue(
      createAccountLinkingRedirect({ query: { success: "tokens_updated" } }),
    );
  });

  it("links through the shared provider logic and returns where to go", async () => {
    const code = await storeHandoff({ reconnectEmailAccountId: "account-1" });

    const response = await POST(createRequest({ code }), {} as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      redirectPath: "/accounts?success=account_created_and_linked",
    });
    expect(mockLinkGoogleAccount).toHaveBeenCalledWith({
      code: "provider-code",
      targetUserId: "user-1",
      reconnectEmailAccountId: "account-1",
      logger: expect.anything(),
    });
  });

  it("passes the linking error outcome through to the app", async () => {
    mockLinkMicrosoftAccount.mockResolvedValue(
      createAccountLinkingRedirect({
        query: { error: "reconnect_account_mismatch" },
      }),
    );
    const code = await storeHandoff({ provider: "microsoft" });

    const response = await POST(createRequest({ code }), {} as never);

    await expect(response.json()).resolves.toEqual({
      redirectPath: "/accounts?error=reconnect_account_mismatch",
    });
    expect(mockLinkGoogleAccount).not.toHaveBeenCalled();
  });

  it("rejects a verifier that does not match the challenge", async () => {
    const code = await storeHandoff();

    const response = await POST(
      createRequest({ code, codeVerifier: "w".repeat(43) }),
      {} as never,
    );

    expect(response.status).toBe(400);
    expect(mockLinkGoogleAccount).not.toHaveBeenCalled();
  });

  it("rejects a session for a different user than the one who started", async () => {
    const code = await storeHandoff({ userId: "attacker-user" });

    const response = await POST(createRequest({ code }), {} as never);

    expect(response.status).toBe(403);
    expect(mockLinkGoogleAccount).not.toHaveBeenCalled();
  });

  it("only lets a handoff code be used once", async () => {
    const code = await storeHandoff();

    await POST(createRequest({ code }), {} as never);
    const reused = await POST(createRequest({ code }), {} as never);

    expect(reused.status).toBe(400);
    expect(mockLinkGoogleAccount).toHaveBeenCalledTimes(1);
  });

  it("does not let an email code session link a mailbox", async () => {
    mockAuthState.emailOtp = true;
    const code = await storeHandoff();

    const response = await POST(createRequest({ code }), {} as never);

    expect(response.status).toBe(403);
    expect(mockLinkGoogleAccount).not.toHaveBeenCalled();
  });
});

function storeHandoff(
  overrides: Partial<Parameters<typeof storeDesktopAccountLinkHandoff>[0]> = {},
) {
  return storeDesktopAccountLinkHandoff({
    provider: "google",
    providerCode: "provider-code",
    userId: "user-1",
    codeChallenge: getMobileAuthCodeChallenge(VERIFIER),
    stateNonce: "state-nonce",
    reconnectEmailAccountId: null,
    ...overrides,
  });
}

function createRequest({
  code,
  codeVerifier = VERIFIER,
}: {
  code: string;
  codeVerifier?: string;
}) {
  return new NextRequest(
    "http://localhost:3000/api/desktop-account-link/complete",
    { method: "POST", body: JSON.stringify({ code, codeVerifier }) },
  );
}
