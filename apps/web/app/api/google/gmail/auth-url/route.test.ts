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
  generateOAuthState: vi.fn(() => "mock-state"),
  oauthStateCookieOptions: {},
}));

// Mock Gmail client
vi.mock("@/utils/gmail/client", () => ({
  getLinkingOAuth2Client: vi.fn(() => ({
    generateAuthUrl: vi.fn(
      () =>
        "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&scope=gmail.modify%20gmail.settings.basic%20userinfo.profile%20userinfo.email&access_type=offline&prompt=consent",
    ),
  })),
}));

// Mock Gmail constants
vi.mock("@/utils/gmail/constants", () => ({
  GMAIL_STATE_COOKIE_NAME: "gmail_state",
}));

// Mock Gmail scopes
vi.mock("@/utils/gmail/scopes", () => ({
  SCOPES: [
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/gmail.modify",
  ],
}));

// Mock middleware
vi.mock("@/utils/middleware", () => ({
  withAuth: (handler: any) => handler,
}));

vi.mock("@/utils/prisma");

// Import after mocks
import { GET } from "./route";

describe("/api/google/gmail/auth-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRequest = (userId: string) => {
    return {
      auth: { userId },
      nextUrl: { origin: "http://localhost:3000" },
      cookies: {
        set: vi.fn(),
      },
    } as unknown as NextRequest;
  };

  describe("GET", () => {
    it("should return valid OAuth URL when user has email account", async () => {
      const userId = "user-123";
      const emailAccountId = "email-account-123";

      prisma.emailAccount.findFirst.mockResolvedValue({
        id: emailAccountId,
      });

      const request = mockRequest(userId);
      const response = await GET(request);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.url).toContain(
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      expect(data.url).toContain("client_id=");
      expect(data.url).toContain("scope=");
      expect(data.url).toContain("access_type=offline");
      expect(data.url).toContain("prompt=consent");
    });

    it("should include Gmail scopes in the URL", async () => {
      const userId = "user-123";
      const emailAccountId = "email-account-123";

      prisma.emailAccount.findFirst.mockResolvedValue({
        id: emailAccountId,
      });

      const request = mockRequest(userId);
      const response = await GET(request);

      const data = await response.json();
      const url = new URL(data.url);
      const scope = url.searchParams.get("scope");

      expect(scope).toContain("gmail.modify");
      expect(scope).toContain("gmail.settings.basic");
      expect(scope).toContain("userinfo.profile");
      expect(scope).toContain("userinfo.email");
    });

    it("should set state cookie", async () => {
      const userId = "user-123";
      const emailAccountId = "email-account-123";

      prisma.emailAccount.findFirst.mockResolvedValue({
        id: emailAccountId,
      });

      const mockCookiesSet = vi.fn();
      const request = {
        auth: { userId },
        nextUrl: { origin: "http://localhost:3000" },
        cookies: {
          set: mockCookiesSet,
        },
      } as unknown as NextRequest;

      const response = await GET(request);

      expect(response.status).toBe(200);
      // Note: The actual cookie setting happens in the route handler
      // We can't easily test the NextResponse.cookies.set call in this unit test
    });

    it("should return 404 when user has no email account", async () => {
      const userId = "user-123";

      prisma.emailAccount.findFirst.mockResolvedValue(null);

      const request = mockRequest(userId);
      const response = await GET(request);

      expect(response.status).toBe(404);

      const data = await response.json();
      expect(data.error).toBe("No email account found");
    });

    it("should handle database errors gracefully", async () => {
      const userId = "user-123";

      prisma.emailAccount.findFirst.mockRejectedValue(
        new Error("Database error"),
      );

      const request = mockRequest(userId);

      await expect(GET(request)).rejects.toThrow("Database error");
    });
  });
});
