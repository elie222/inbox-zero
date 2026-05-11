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
  mockCaptureException,
  mockAuth,
} = vi.hoisted(() => ({
  mockValidateOAuthCallback: vi.fn(),
  mockHandleAccountLinking: vi.fn(),
  mockGetOAuthCodeResult: vi.fn(),
  mockAcquireOAuthCodeLock: vi.fn(),
  mockSetOAuthCodeResult: vi.fn(),
  mockClearOAuthCode: vi.fn(),
  mockCaptureException: vi.fn(),
  mockAuth: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-auth-secret",
    EMAIL_ENCRYPT_SALT: "test-email-salt",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    MICROSOFT_CLIENT_ID: "client-id",
    MICROSOFT_CLIENT_SECRET: "client-secret",
    MICROSOFT_TENANT_ID: "common",
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
        ).logger = createScopedLogger("test/outlook-linking-callback");
        return handler(request);
      },
  };
});

vi.mock("@/utils/prisma");

vi.mock("@/utils/error", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/error")>();
  return {
    ...actual,
    captureException: mockCaptureException,
  };
});

vi.mock("@/utils/oauth/callback-validation", async (importActual) => {
  const actual =
    await importActual<typeof import("@/utils/oauth/callback-validation")>();
  return {
    ...actual,
    validateOAuthCallback: mockValidateOAuthCallback,
  };
});

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

vi.mock("@/utils/auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/utils/outlook/scopes", () => ({
  SCOPES: [
    "openid",
    "profile",
    "email",
    "User.Read",
    "offline_access",
    "Mail.ReadWrite",
    "Mail.Send",
    "MailboxSettings.ReadWrite",
  ],
}));

import { generateSignedOAuthState } from "@/utils/oauth/state";
import { GET } from "./route";

describe("outlook linking callback route", () => {
  const createSignedState = (userId = "user-123") =>
    generateSignedOAuthState({ userId });

  const createRequest = (url: string, state = createSignedState()) =>
    new NextRequest(url, {
      headers: {
        cookie: `outlook_linking_state=${state}`,
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
    prisma.account.findUnique.mockResolvedValue(null);
  });

  it("redirects with consent_incomplete when Microsoft linking lacks required consent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "access-token",
            refresh_token: "refresh-token",
            scope: "Mail.ReadWrite MailboxSettings.ReadWrite",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "provider-account-id",
            userPrincipalName: "user@example.com",
          }),
        }),
    );

    const response = await GET(
      createRequest("http://localhost:3000/api/outlook/linking/callback"),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("/accounts");
    expect(redirectLocation).toContain("error=consent_incomplete");
    expect(redirectLocation).toContain("approve+every+requested+permission");
    expect(mockHandleAccountLinking).not.toHaveBeenCalled();
    expect(mockSetOAuthCodeResult).not.toHaveBeenCalled();
    expect(mockClearOAuthCode).toHaveBeenCalledWith("valid-auth-code");
  });

  it("allows successful linking when Microsoft token scope omits OIDC scopes", async () => {
    mockHandleAccountLinking.mockResolvedValue({
      type: "continue_create",
    });
    prisma.account.create.mockResolvedValue({
      id: "account-123",
    } as Awaited<ReturnType<typeof prisma.account.create>>);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "access-token",
            refresh_token: "refresh-token",
            scope: "Mail.ReadWrite Mail.Send MailboxSettings.ReadWrite",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "provider-account-id",
            userPrincipalName: "user@example.com",
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
        }),
    );

    const response = await GET(
      createRequest("http://localhost:3000/api/outlook/linking/callback"),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("success=account_created_and_linked");
    expect(mockHandleAccountLinking).toHaveBeenCalled();
    expect(prisma.account.create).toHaveBeenCalled();
    expect(mockSetOAuthCodeResult).toHaveBeenCalledWith("valid-auth-code", {
      success: "account_created_and_linked",
    });
  });

  it("redirects with admin_consent_required when Microsoft returns an AADSTS65001 callback error", async () => {
    const state = createSignedState();
    const response = await GET(
      createRequest(
        `http://localhost:3000/api/outlook/linking/callback?error=access_denied&error_description=AADSTS65001&state=${encodeURIComponent(state)}`,
        state,
      ),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("error=admin_consent_required");
    expect(redirectLocation).toContain("admin+approval");
    expect(mockValidateOAuthCallback).not.toHaveBeenCalled();
    expect(mockHandleAccountLinking).not.toHaveBeenCalled();
  });

  it("redirects with consent_declined when Microsoft consent is canceled", async () => {
    const state = createSignedState();
    const response = await GET(
      createRequest(
        `http://localhost:3000/api/outlook/linking/callback?error=access_denied&error_description=AADSTS65004&state=${encodeURIComponent(state)}`,
        state,
      ),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("error=consent_declined");
    expect(redirectLocation).toContain("consent+screen");
    expect(mockValidateOAuthCallback).not.toHaveBeenCalled();
    expect(mockHandleAccountLinking).not.toHaveBeenCalled();
  });

  it("redirects with invalid_state for Microsoft callback errors with mismatched state", async () => {
    const cookieState = createSignedState();
    const queryState = createSignedState();
    const response = await GET(
      createRequest(
        `http://localhost:3000/api/outlook/linking/callback?error=access_denied&error_description=AADSTS65001&state=${encodeURIComponent(queryState)}`,
        cookieState,
      ),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("error=invalid_state");
    expect(mockValidateOAuthCallback).not.toHaveBeenCalled();
  });

  it("allows successful reconnects when Microsoft omits scope from the token response", async () => {
    prisma.account.findUnique.mockResolvedValue({
      id: "account-123",
      userId: "user-123",
      refresh_token: "stored-refresh-token",
      user: { name: "Test User", email: "user@example.com" },
      emailAccount: { id: "email-account-123" },
    } as Awaited<ReturnType<typeof prisma.account.findUnique>>);
    mockHandleAccountLinking.mockResolvedValue({
      type: "update_tokens",
      existingAccountId: "account-123",
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "access-token",
            refresh_token: "refresh-token",
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "provider-account-id",
            userPrincipalName: "user@example.com",
          }),
        }),
    );

    const response = await GET(
      createRequest("http://localhost:3000/api/outlook/linking/callback"),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("success=tokens_updated");
    expect(mockHandleAccountLinking).toHaveBeenCalled();
    expect(mockSetOAuthCodeResult).toHaveBeenCalledWith("valid-auth-code", {
      success: "tokens_updated",
    });
  });

  it("maps token exchange AADSTS errors through the shared Microsoft error handler", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error_description:
            "AADSTS65001: The user or administrator has not consented to use the application.",
        }),
      }),
    );

    const response = await GET(
      createRequest("http://localhost:3000/api/outlook/linking/callback"),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("error=admin_consent_required");
    expect(mockClearOAuthCode).toHaveBeenCalledWith("valid-auth-code");
  });

  it("retries Microsoft token exchange with IPv4 when the first request fails with ENETUNREACH", async () => {
    mockHandleAccountLinking.mockResolvedValue({
      type: "continue_create",
    });
    prisma.account.create.mockResolvedValue({
      id: "account-123",
    } as Awaited<ReturnType<typeof prisma.account.create>>);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(createFetchFailedError("ENETUNREACH"))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "access-token",
            refresh_token: "refresh-token",
            scope: "Mail.ReadWrite Mail.Send MailboxSettings.ReadWrite",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "provider-account-id",
            userPrincipalName: "user@example.com",
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
        }),
    );

    const response = await GET(
      createRequest("http://localhost:3000/api/outlook/linking/callback"),
    );

    expect(response.headers.get("location")).toContain(
      "success=account_created_and_linked",
    );
    expect(mockHandleAccountLinking).toHaveBeenCalled();
    expect(prisma.account.create).toHaveBeenCalled();
  });

  it("sanitizes unmapped Microsoft token errors before redirecting", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error_description:
            "AADSTS700016: Application with identifier was not found in the directory.",
        }),
      }),
    );

    const response = await GET(
      createRequest("http://localhost:3000/api/outlook/linking/callback"),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("error=link_failed");
    expect(redirectLocation).toContain(
      "error_description=Microsoft+error+AADSTS700016.",
    );
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
    prisma.account.create.mockResolvedValue({
      id: "account-123",
    } as Awaited<ReturnType<typeof prisma.account.create>>);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            access_token: "access-token",
            refresh_token: "refresh-token",
            scope: "Mail.ReadWrite Mail.Send MailboxSettings.ReadWrite",
            token_type: "Bearer",
            expires_in: 3600,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: "provider-account-id",
            userPrincipalName: "user@example.com",
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
        }),
    );

    const response = await GET(
      createRequest("http://localhost:3000/api/outlook/linking/callback"),
    );

    expect(response.headers.get("location")).toContain("error=invalid_state");
    expect(mockHandleAccountLinking).not.toHaveBeenCalled();
    const warning = consoleWarn.mock.calls[0]?.[0];
    expect(warning).toContain("OAuth linking callback actor mismatch");
    expect(warning).toContain('"actorUserId": "actor-user"');
    expect(warning).toContain('"targetUserId": "target-user"');
    consoleWarn.mockRestore();
  });
});

function createFetchFailedError(code: string) {
  const connectError = Object.assign(new Error(`connect ${code}`), { code });
  const error = new TypeError("fetch failed") as TypeError & {
    cause: AggregateError;
  };

  error.cause = new AggregateError([connectError], `connect ${code}`);

  return error;
}
