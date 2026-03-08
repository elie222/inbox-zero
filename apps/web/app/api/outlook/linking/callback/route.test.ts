vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockLogger,
  mockValidateOAuthCallback,
  mockHandleAccountLinking,
  mockGetOAuthCodeResult,
  mockAcquireOAuthCodeLock,
  mockSetOAuthCodeResult,
  mockClearOAuthCode,
  mockCaptureException,
} = vi.hoisted(() => ({
  mockLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
  },
  mockValidateOAuthCallback: vi.fn(),
  mockHandleAccountLinking: vi.fn(),
  mockGetOAuthCodeResult: vi.fn(),
  mockAcquireOAuthCodeLock: vi.fn(),
  mockSetOAuthCodeResult: vi.fn(),
  mockClearOAuthCode: vi.fn(),
  mockCaptureException: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    MICROSOFT_CLIENT_ID: "client-id",
    MICROSOFT_CLIENT_SECRET: "client-secret",
    MICROSOFT_TENANT_ID: "common",
  },
}));

vi.mock("@/utils/middleware", () => ({
  withError:
    (_name: string, handler: (request: NextRequest) => Promise<Response>) =>
    async (request: NextRequest) => {
      (request as NextRequest & { logger: typeof mockLogger }).logger =
        mockLogger;
      return handler(request);
    },
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    account: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    emailAccount: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/utils/error", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/error")>();
  return {
    ...actual,
    captureException: mockCaptureException,
  };
});

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

import { GET } from "./route";

describe("outlook linking callback route", () => {
  const createRequest = (url: string, state = "valid-state") =>
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
      code: "valid-auth-code",
    });
    mockGetOAuthCodeResult.mockResolvedValue(null);
    mockAcquireOAuthCodeLock.mockResolvedValue(true);
  });

  it("redirects with consent_incomplete when Microsoft linking lacks required consent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: "access-token",
          scope:
            "openid profile email User.Read Mail.ReadWrite Mail.Send MailboxSettings.ReadWrite",
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
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Microsoft linking returned incomplete consent",
      expect.objectContaining({
        targetUserId: "user-123",
        hasRefreshToken: false,
        missingScopes: ["offline_access"],
      }),
    );
  });

  it("redirects with admin_consent_required when Microsoft returns an AADSTS65001 callback error", async () => {
    const response = await GET(
      createRequest(
        "http://localhost:3000/api/outlook/linking/callback?error=access_denied&error_description=AADSTS65001&state=valid-state",
      ),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("error=admin_consent_required");
    expect(redirectLocation).toContain("admin+approval");
    expect(mockValidateOAuthCallback).not.toHaveBeenCalled();
    expect(mockHandleAccountLinking).not.toHaveBeenCalled();
  });

  it("redirects with consent_declined when Microsoft consent is canceled", async () => {
    const response = await GET(
      createRequest(
        "http://localhost:3000/api/outlook/linking/callback?error=access_denied&error_description=AADSTS65004&state=valid-state",
      ),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("error=consent_declined");
    expect(redirectLocation).toContain("consent+screen");
    expect(mockValidateOAuthCallback).not.toHaveBeenCalled();
    expect(mockHandleAccountLinking).not.toHaveBeenCalled();
  });

  it("redirects with invalid_state for Microsoft callback errors with mismatched state", async () => {
    const response = await GET(
      createRequest(
        "http://localhost:3000/api/outlook/linking/callback?error=access_denied&error_description=AADSTS65001&state=wrong-state",
      ),
    );

    const redirectLocation = response.headers.get("location");
    expect(redirectLocation).toContain("error=invalid_state");
    expect(mockValidateOAuthCallback).not.toHaveBeenCalled();
  });

  it("allows successful reconnects when Microsoft omits scope from the token response", async () => {
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
});
