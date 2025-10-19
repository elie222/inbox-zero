import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import prisma from "@/utils/__mocks__/prisma";

// Mock server-only modules
vi.mock("server-only", () => ({}));

// Mock environment variables
vi.mock("@/env", () => ({
  env: {
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  },
}));

// Mock OAuth utilities
vi.mock("@/utils/oauth/state", () => ({
  parseOAuthState: vi.fn(() => ({
    emailAccountId: "email-account-123",
    type: "gmail",
    nonce: "nonce-123",
  })),
}));

// Mock Gmail client
vi.mock("@/utils/gmail/client", () => ({
  getLinkingOAuth2Client: vi.fn(),
}));

// Mock Gmail constants
vi.mock("@/utils/gmail/constants", () => ({
  GMAIL_STATE_COOKIE_NAME: "gmail_state",
}));

// Mock middleware
vi.mock("@/utils/middleware", () => ({
  withError: (handler: any) => handler,
}));

// Mock auth
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/utils/prisma");

// Import after mocks
import { GET } from "./route";

import { auth } from "@/utils/auth";

describe("/api/google/gmail/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAuth = auth as any;

  const mockRequest = (params: {
    code?: string;
    state?: string;
    storedState?: string;
    userId?: string;
    emailAccountId?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.code) searchParams.set("code", params.code);
    if (params.state) searchParams.set("state", params.state);

    return {
      nextUrl: {
        searchParams,
        origin: "http://localhost:3000",
      },
      cookies: {
        get: vi.fn().mockReturnValue({
          value: params.storedState,
        }),
        delete: vi.fn(),
      },
      auth: {
        userId: params.userId,
      },
    } as unknown as NextRequest;
  };

  describe("GET", () => {
    it("should redirect to /welcome on successful OAuth callback", async () => {
      const userId = "user-123";
      const emailAccountId = "email-account-123";
      const code = "auth-code-123";
      const state = "state-123";

      mockAuth.mockResolvedValue({
        user: { id: userId },
      });

      prisma.emailAccount.findFirst.mockResolvedValue({
        id: emailAccountId,
        accountId: "account-123",
      });

      const mockOAuth2Client = {
        getToken: vi.fn().mockResolvedValue({
          tokens: {
            id_token: "id-token",
            access_token: "access-token",
            refresh_token: "refresh-token",
            expiry_date: Date.now() + 3_600_000,
          },
        }),
        verifyIdToken: vi.fn().mockResolvedValue({
          getPayload: () => ({
            email: "test@example.com",
            sub: "google-user-id",
          }),
        }),
      };

      const { getLinkingOAuth2Client } = await import("@/utils/gmail/client");
      vi.mocked(getLinkingOAuth2Client).mockReturnValue(mockOAuth2Client);

      prisma.account.update.mockResolvedValue({});

      const request = mockRequest({
        code,
        state,
        storedState: state,
        userId,
        emailAccountId,
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain("/welcome");
    });

    it("should redirect to /connect-gmail with error when code is missing", async () => {
      const request = mockRequest({
        state: "state-123",
        storedState: "state-123",
        userId: "user-123",
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/connect-gmail?error=missing_code",
      );
    });

    it("should redirect to /connect-gmail with error when state is invalid", async () => {
      const request = mockRequest({
        code: "auth-code-123",
        state: "invalid-state",
        storedState: "different-state",
        userId: "user-123",
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/connect-gmail?error=invalid_state",
      );
    });

    it("should redirect to /connect-gmail with error when user is unauthorized", async () => {
      mockAuth.mockResolvedValue(null);

      const request = mockRequest({
        code: "auth-code-123",
        state: "state-123",
        storedState: "state-123",
        userId: undefined,
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/connect-gmail?error=unauthorized",
      );
    });

    it("should redirect to /connect-gmail with error when email account not found", async () => {
      const userId = "user-123";

      mockAuth.mockResolvedValue({
        user: { id: userId },
      });

      prisma.emailAccount.findFirst.mockResolvedValue(null);

      const request = mockRequest({
        code: "auth-code-123",
        state: "state-123",
        storedState: "state-123",
        userId,
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/connect-gmail?error=forbidden",
      );
    });

    it("should update account tokens on successful callback", async () => {
      const userId = "user-123";
      const emailAccountId = "email-account-123";
      const accountId = "account-123";
      const code = "auth-code-123";
      const state = "state-123";

      mockAuth.mockResolvedValue({
        user: { id: userId },
      });

      prisma.emailAccount.findFirst.mockResolvedValue({
        id: emailAccountId,
        accountId,
      });

      const mockOAuth2Client = {
        getToken: vi.fn().mockResolvedValue({
          tokens: {
            id_token: "id-token",
            access_token: "new-access-token",
            refresh_token: "new-refresh-token",
            expiry_date: Date.now() + 3_600_000,
          },
        }),
        verifyIdToken: vi.fn().mockResolvedValue({
          getPayload: () => ({
            email: "test@example.com",
            sub: "google-user-id",
          }),
        }),
      };

      const { getLinkingOAuth2Client } = await import("@/utils/gmail/client");
      vi.mocked(getLinkingOAuth2Client).mockReturnValue(mockOAuth2Client);

      prisma.account.update.mockResolvedValue({});

      const request = mockRequest({
        code,
        state,
        storedState: state,
        userId,
        emailAccountId,
      });

      await GET(request);

      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: accountId },
        data: {
          access_token: "new-access-token",
          refresh_token: "new-refresh-token",
          expires_at: expect.any(Date),
        },
      });
    });

    it("should handle OAuth errors gracefully", async () => {
      const userId = "user-123";
      const emailAccountId = "email-account-123";
      const code = "auth-code-123";
      const state = "state-123";

      mockAuth.mockResolvedValue({
        user: { id: userId },
      });

      prisma.emailAccount.findFirst.mockResolvedValue({
        id: emailAccountId,
        accountId: "account-123",
      });

      const mockOAuth2Client = {
        getToken: vi.fn().mockRejectedValue(new Error("OAuth error")),
      };

      const { getLinkingOAuth2Client } = await import("@/utils/gmail/client");
      vi.mocked(getLinkingOAuth2Client).mockReturnValue(mockOAuth2Client);

      const request = mockRequest({
        code,
        state,
        storedState: state,
        userId,
        emailAccountId,
      });

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toContain(
        "/connect-gmail?error=connection_failed",
      );
    });
  });
});
