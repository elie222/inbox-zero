vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  mockValidateOAuthCallback,
  mockHandleAccountLinking,
  mockGetOAuthCodeResult,
  mockAcquireOAuthCodeLock,
  mockSetOAuthCodeResult,
  mockClearOAuthCode,
  mockGetToken,
  mockFetchGoogleOpenIdProfile,
  mockIsGoogleOauthEmulationEnabled,
  mockAuth,
} = vi.hoisted(() => ({
  mockValidateOAuthCallback: vi.fn(),
  mockHandleAccountLinking: vi.fn(),
  mockGetOAuthCodeResult: vi.fn(),
  mockAcquireOAuthCodeLock: vi.fn(),
  mockSetOAuthCodeResult: vi.fn(),
  mockClearOAuthCode: vi.fn(),
  mockGetToken: vi.fn(),
  mockFetchGoogleOpenIdProfile: vi.fn(),
  mockIsGoogleOauthEmulationEnabled: vi.fn(() => true),
  mockAuth: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-auth-secret",
    EMAIL_ENCRYPT_SALT: "test-email-salt",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    GOOGLE_CLIENT_ID: "client-id",
  },
}));

vi.mock("@/utils/middleware", async () => {
  const { createScopedLogger } =
    await vi.importActual<typeof import("@/utils/logger")>("@/utils/logger");

  return {
    withError:
      (_name: string, handler: (request: NextRequest) => Promise<Response>) =>
      async (request: NextRequest) => {
        (
          request as NextRequest & {
            logger: ReturnType<typeof createScopedLogger>;
          }
        ).logger = createScopedLogger("test/google-linking-callback");
        return handler(request);
      },
  };
});

vi.mock("@/utils/prisma");

vi.mock("@/utils/oauth/callback-validation", () => ({
  validateOAuthCallback: mockValidateOAuthCallback,
}));

vi.mock("@/utils/oauth/account-linking", () => ({
  handleAccountLinking: mockHandleAccountLinking,
}));

vi.mock("@/utils/user/merge-account", () => ({
  mergeAccount: vi.fn(),
}));

vi.mock("@/utils/redis/oauth-code", () => ({
  acquireOAuthCodeLock: mockAcquireOAuthCodeLock,
  getOAuthCodeResult: mockGetOAuthCodeResult,
  setOAuthCodeResult: mockSetOAuthCodeResult,
  clearOAuthCode: mockClearOAuthCode,
}));

vi.mock("@/utils/prisma-helpers", () => ({
  isDuplicateError: vi.fn(() => false),
}));

vi.mock("@/utils/gmail/client", () => ({
  getLinkingOAuth2Client: vi.fn(() => ({
    getToken: mockGetToken,
  })),
}));

vi.mock("@/utils/google/oauth", () => ({
  fetchGoogleOpenIdProfile: mockFetchGoogleOpenIdProfile,
  isGoogleOauthEmulationEnabled: mockIsGoogleOauthEmulationEnabled,
}));

vi.mock("@/utils/auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/utils/error", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/error")>();
  return actual;
});

import { GET } from "./route";

describe("google linking callback route", () => {
  const createRequest = (url: string, state = "valid-state") =>
    new NextRequest(url, {
      headers: {
        cookie: `google_linking_state=${state}`,
      },
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOAuthCallback.mockReturnValue({
      success: true,
      targetUserId: "user-123",
      stateNonce: "state-nonce",
      code: "valid-auth-code",
    });
    mockGetOAuthCodeResult.mockResolvedValue(null);
    mockAcquireOAuthCodeLock.mockResolvedValue(true);
    mockAuth.mockResolvedValue({
      user: {
        id: "user-123",
      },
    });
    mockGetToken.mockResolvedValue({
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expiry_date: 1_700_000_000_000,
        id_token: "id-token",
        scope: "openid email profile",
        token_type: "Bearer",
      },
    });
    mockFetchGoogleOpenIdProfile.mockResolvedValue({
      sub: "new-provider-account-id",
      email: "user@example.com",
      name: "Test User",
      picture: "https://example.com/avatar.png",
    });
    prisma.account.findUnique.mockResolvedValue(null);
    prisma.emailAccount.findFirst.mockResolvedValue(null);
    prisma.account.create.mockResolvedValue({
      id: "account-123",
    } as Awaited<ReturnType<typeof prisma.account.create>>);
    prisma.account.update.mockResolvedValue({
      id: "account-123",
    } as Awaited<ReturnType<typeof prisma.account.update>>);
  });

  it("updates an existing same-user Google account in emulation instead of creating a duplicate", async () => {
    mockHandleAccountLinking.mockResolvedValue({
      type: "continue_create",
    });
    prisma.emailAccount.findFirst.mockResolvedValue({
      accountId: "existing-account-123",
    } as Awaited<ReturnType<typeof prisma.emailAccount.findFirst>>);

    const response = await GET(
      createRequest("http://localhost:3000/api/google/linking/callback"),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("success=tokens_updated");
    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: "existing-account-123" },
      data: expect.objectContaining({
        providerAccountId: "new-provider-account-id",
        access_token: "access-token",
        refresh_token: "refresh-token",
        scope: "openid email profile",
      }),
    });
    expect(prisma.account.create).not.toHaveBeenCalled();
    expect(mockSetOAuthCodeResult).toHaveBeenCalledWith("valid-auth-code", {
      success: "tokens_updated",
    });
  });

  it("keeps the create path outside Google OAuth emulation", async () => {
    mockIsGoogleOauthEmulationEnabled.mockReturnValue(false);
    mockHandleAccountLinking.mockResolvedValue({
      type: "continue_create",
    });
    const googleClient = {
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          sub: "new-provider-account-id",
          email: "user@example.com",
          name: "Test User",
          picture: "https://example.com/avatar.png",
        }),
      }),
      getToken: mockGetToken,
    };
    const { getLinkingOAuth2Client } = await import("@/utils/gmail/client");
    vi.mocked(getLinkingOAuth2Client).mockReturnValue(googleClient as never);

    const response = await GET(
      createRequest("http://localhost:3000/api/google/linking/callback"),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("success=account_created_and_linked");
    expect(prisma.account.create).toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
  });

  it("rejects the callback when the actor differs from the target user", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockAuth.mockResolvedValue({
      user: {
        id: "actor-user",
      },
    });
    mockValidateOAuthCallback.mockReturnValue({
      success: true,
      targetUserId: "target-user",
      stateNonce: "state-nonce",
      code: "valid-auth-code",
    });
    mockHandleAccountLinking.mockResolvedValue({
      type: "continue_create",
    });

    const response = await GET(
      createRequest("http://localhost:3000/api/google/linking/callback"),
    );

    expect(response.headers.get("location")).toContain("error=invalid_state");
    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockHandleAccountLinking).not.toHaveBeenCalled();
    const warning = consoleWarn.mock.calls[0]?.[0];
    expect(warning).toContain("OAuth linking callback actor mismatch");
    expect(warning).toContain('"actorUserId": "actor-user"');
    expect(warning).toContain('"targetUserId": "target-user"');
    consoleWarn.mockRestore();
  });
});
