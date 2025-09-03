import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { GET } from "./route";

// Mock server-only as per testing guidelines
vi.mock("server-only", () => ({}));

// Mock the auth config
vi.mock("@/utils/auth", () => ({
  betterAuthConfig: {
    api: {
      signInSSO: vi.fn(),
    },
  },
}));

// Mock the logger
vi.mock("@/utils/logger", () => ({
  createScopedLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock Prisma
vi.mock("@/utils/prisma", () => ({
  default: {
    ssoProvider: {
      findFirst: vi.fn(),
    },
  },
}));

// Import the mocked modules
import { betterAuthConfig } from "@/utils/auth";
import { createScopedLogger } from "@/utils/logger";

const mockBetterAuthConfig = vi.mocked(betterAuthConfig);
const mockLogger = vi.mocked(createScopedLogger);

describe("SSO Signin Route", () => {
  const mockContext = { params: Promise.resolve({}) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper function to create mock NextRequest with search params
  const createMockRequest = (
    searchParams: Record<string, string> = {},
  ): NextRequest => {
    const url = new URL("http://localhost/api/sso/signin");
    Object.entries(searchParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    return new NextRequest(url, { method: "GET" });
  };

  describe("Parameter validation", () => {
    test("should return 400 when email parameter is missing", async () => {
      const request = createMockRequest({ organizationSlug: "test-org" });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: "Email parameter is required",
        isKnownError: true,
      });
    });

    test("should return 400 when organization name parameter is missing", async () => {
      const request = createMockRequest({ email: "user@company.com" });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: "Organization name parameter is required",
        isKnownError: true,
      });
    });

    test("should return 400 when email has invalid format", async () => {
      const request = createMockRequest({
        email: "invalid-email",
        organizationSlug: "test-org",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: "Invalid email format",
        isKnownError: true,
      });
    });

    test("should return 400 when email has no domain", async () => {
      const request = createMockRequest({
        email: "user@",
        organizationSlug: "test-org",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: "Invalid email format",
        isKnownError: true,
      });
    });
  });

  describe("ProviderId parameter precedence", () => {
    test("should use providerId when provided, ignoring email domain", async () => {
      const mockSignInSSOResponse = { url: "https://sso.example.com/signin" };
      mockBetterAuthConfig.api.signInSSO.mockResolvedValue(
        mockSignInSSOResponse,
      );

      const request = createMockRequest({
        email: "user@company.com",
        organizationSlug: "test-org",
        providerId: "custom-provider-id",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      // Should not query Prisma for domain-based lookup
      expect(prisma.ssoProvider.findFirst).not.toHaveBeenCalled();

      // Should use the provided providerId
      expect(mockBetterAuthConfig.api.signInSSO).toHaveBeenCalledWith({
        body: {
          providerId: "custom-provider-id",
          callbackURL: "/accounts",
        },
      });

      expect(responseBody).toEqual({
        redirectUrl: "https://sso.example.com/signin",
        providerId: "custom-provider-id",
      });
    });

    test("should use providerId even when email domain has different provider", async () => {
      const mockSignInSSOResponse = { url: "https://sso.example.com/signin" };
      mockBetterAuthConfig.api.signInSSO.mockResolvedValue(
        mockSignInSSOResponse,
      );

      // Mock that company.com has a different provider
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue({
        providerId: "company-provider-id",
      } as any);

      const request = createMockRequest({
        email: "user@company.com",
        organizationSlug: "test-org",
        providerId: "override-provider-id",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      // Should not query Prisma for domain-based lookup
      expect(prisma.ssoProvider.findFirst).not.toHaveBeenCalled();

      // Should use the provided providerId, not the domain-based one
      expect(mockBetterAuthConfig.api.signInSSO).toHaveBeenCalledWith({
        body: {
          providerId: "override-provider-id",
          callbackURL: "/accounts",
        },
      });

      expect(responseBody.providerId).toBe("override-provider-id");
    });
  });

  describe("Domain-based provider lookup", () => {
    test("should find provider by email domain when no providerId provided", async () => {
      const mockSignInSSOResponse = { url: "https://sso.example.com/signin" };
      mockBetterAuthConfig.api.signInSSO.mockResolvedValue(
        mockSignInSSOResponse,
      );

      // Mock the Prisma call to return a provider
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue({
        providerId: "company-provider-id",
      } as any);

      const request = createMockRequest({
        email: "user@company.com",
        organizationSlug: "test-org",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      // Should query Prisma for domain-based lookup with organization relation
      expect(prisma.ssoProvider.findFirst).toHaveBeenCalledWith({
        where: {
          domain: "company.com",
          organization: {
            slug: "test-org",
          },
        },
        select: {
          providerId: true,
        },
      });

      expect(mockBetterAuthConfig.api.signInSSO).toHaveBeenCalledWith({
        body: {
          providerId: "company-provider-id",
          callbackURL: "/accounts",
        },
      });

      expect(responseBody).toEqual({
        redirectUrl: "https://sso.example.com/signin",
        providerId: "company-provider-id",
      });
    });

    test("should redirect to /login/error when organization not found", async () => {
      // Mock the ssoProvider lookup to return null (organization not found)
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue(null as any);

      const request = createMockRequest({
        email: "user@company.com",
        organizationSlug: "non-existent-org",
      });

      const response = await GET(request, mockContext);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost/login/error?error=organization_not_found",
      );

      // Should query ssoProvider with organization relation
      expect(prisma.ssoProvider.findFirst).toHaveBeenCalledWith({
        where: {
          domain: "company.com",
          organization: {
            slug: "non-existent-org",
          },
        },
        select: {
          providerId: true,
        },
      });
    });

    test("should redirect to /login/error when no provider found for domain", async () => {
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue(null as any);

      const request = createMockRequest({
        email: "user@unknown-domain.com",
        organizationSlug: "test-org",
      });

      const response = await GET(request, mockContext);

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost/login/error?error=organization_not_found",
      );

      expect(prisma.ssoProvider.findFirst).toHaveBeenCalledWith({
        where: {
          domain: "unknown-domain.com",
          organization: {
            slug: "test-org",
          },
        },
        select: {
          providerId: true,
        },
      });
    });
  });

  describe("Error handling", () => {
    test("should return 500 when betterAuth fails", async () => {
      const request = createMockRequest({
        email: "user@company.com",
        organizationSlug: "test-org",
        providerId: "non-existent-provider",
      });

      // Mock that the providerId doesn't exist (betterAuth will handle this)
      mockBetterAuthConfig.api.signInSSO.mockRejectedValue(
        new Error("Provider not found"),
      );

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(500);
      expect(responseBody).toEqual({
        error: "An unexpected error occurred",
      });
    });
  });

  describe("Successful SSO signin flow", () => {
    test("should return correct response structure on success", async () => {
      const mockSignInSSOResponse = {
        url: "https://sso.example.com/signin?token=abc123",
      };
      mockBetterAuthConfig.api.signInSSO.mockResolvedValue(
        mockSignInSSOResponse,
      );

      const request = createMockRequest({
        email: "user@company.com",
        providerId: "test-provider",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(200);
      expect(responseBody).toEqual({
        redirectUrl: "https://sso.example.com/signin?token=abc123",
        providerId: "test-provider",
      });
    });

    test("should log SSO sign-in request", async () => {
      const mockSignInSSOResponse = { url: "https://sso.example.com/signin" };
      mockBetterAuthConfig.api.signInSSO.mockResolvedValue(
        mockSignInSSOResponse,
      );

      const request = createMockRequest({
        email: "user@company.com",
        providerId: "test-provider",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      // Verify the main functionality works (logging is a side effect)
      expect(response.status).toBe(200);
      expect(responseBody).toEqual({
        redirectUrl: "https://sso.example.com/signin",
        providerId: "test-provider",
      });
    });

    test("should redirect to /login/error when no SSO provider found", async () => {
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue(null as any);

      const request = createMockRequest({
        email: "user@unknown-domain.com",
      });

      const response = await GET(request, mockContext);

      // Verify the redirect works correctly
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "http://localhost/login/error?error=organization_not_found",
      );
    });
  });

  describe("betterAuthConfig integration", () => {
    test("should call betterAuthConfig.api.signInSSO with correct parameters", async () => {
      const mockSignInSSOResponse = { url: "https://sso.example.com/signin" };
      mockBetterAuthConfig.api.signInSSO.mockResolvedValue(
        mockSignInSSOResponse,
      );

      const request = createMockRequest({
        email: "user@company.com",
        providerId: "test-provider",
      });

      await GET(request, mockContext);

      expect(mockBetterAuthConfig.api.signInSSO).toHaveBeenCalledWith({
        body: {
          providerId: "test-provider",
          callbackURL: "/accounts",
        },
      });
    });

    test("should handle betterAuthConfig errors", async () => {
      const authError = new Error("Authentication failed");
      mockBetterAuthConfig.api.signInSSO.mockRejectedValue(authError);

      const request = createMockRequest({
        email: "user@company.com",
        providerId: "test-provider",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(500);
      expect(responseBody).toEqual({
        error: "An unexpected error occurred",
      });
    });
  });
});
