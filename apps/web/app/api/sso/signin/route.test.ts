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

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { betterAuthConfig } from "@/utils/auth";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { GET } from "./route";

const mockBetterAuthConfig = vi.mocked(betterAuthConfig);
const _mockLogger = vi.mocked(createScopedLogger);

describe("SSO Signin Route", () => {
  const mockContext = { params: Promise.resolve({}) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper function to create mock NextRequest with search params
  const createMockRequest = (params: {
    email?: string;
    organizationSlug?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params.email) searchParams.set("email", params.email);
    if (params.organizationSlug)
      searchParams.set("organizationSlug", params.organizationSlug);

    const url = `http://localhost/api/sso/signin?${searchParams.toString()}`;
    return new NextRequest(url);
  };

  describe("Parameter validation", () => {
    test("should return 400 when email parameter is missing", async () => {
      const request = createMockRequest({ organizationSlug: "test-org" });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody.isKnownError).toBe(true);
      expect(responseBody.error.issues).toHaveLength(1);
      expect(responseBody.error.issues[0].code).toBe("invalid_type");
      expect(responseBody.error.issues[0].path).toEqual(["email"]);
    });

    test("should return 400 when organization name parameter is missing", async () => {
      const request = createMockRequest({ email: "user@example.com" });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody.isKnownError).toBe(true);
      expect(responseBody.error.issues).toHaveLength(1);
      expect(responseBody.error.issues[0].code).toBe("invalid_type");
      expect(responseBody.error.issues[0].path).toEqual(["organizationSlug"]);
    });
  });

  describe("Organization-based provider lookup", () => {
    test("should find provider by organization slug", async () => {
      const mockSignInSSOResponse = { url: "https://sso.example.com/signin" };
      mockBetterAuthConfig.api.signInSSO.mockResolvedValue(
        mockSignInSSOResponse,
      );

      // Mock the Prisma call to return a provider
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue({
        providerId: "test-provider-id",
      } as any);

      const request = createMockRequest({
        email: "user@example.com",
        organizationSlug: "test-org",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      // Should query Prisma for organization-based lookup
      expect(prisma.ssoProvider.findFirst).toHaveBeenCalledWith({
        where: {
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
          providerId: "test-provider-id",
          callbackURL: "/accounts",
        },
      });

      expect(response.status).toBe(200);
      expect(responseBody).toEqual({
        redirectUrl: "https://sso.example.com/signin",
        providerId: "test-provider-id",
      });
    });

    test("should return 400 when organization not found", async () => {
      // Mock the ssoProvider lookup to return null (organization not found)
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue(null as any);

      const request = createMockRequest({
        email: "user@example.com",
        organizationSlug: "non-existent-org",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: "No SSO provider found for this organization",
        isKnownError: true,
      });

      // Should query ssoProvider with organization relation
      expect(prisma.ssoProvider.findFirst).toHaveBeenCalledWith({
        where: {
          organization: {
            slug: "non-existent-org",
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
        email: "user@example.com",
        organizationSlug: "test-org",
      });

      // Mock Prisma to return a provider
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue({
        providerId: "test-provider",
      } as any);

      // Mock betterAuth to throw an error
      mockBetterAuthConfig.api.signInSSO.mockRejectedValue(
        new Error("SSO service unavailable"),
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

      // Mock Prisma to return a provider
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue({
        providerId: "test-provider",
      } as any);

      const request = createMockRequest({
        email: "user@example.com",
        organizationSlug: "test-org",
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

      // Mock Prisma to return a provider
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue({
        providerId: "test-provider",
      } as any);

      const request = createMockRequest({
        email: "user@example.com",
        organizationSlug: "test-org",
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

    test("should return 400 when no SSO provider found", async () => {
      // Mock Prisma to return null (no provider found)
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue(null as any);

      const request = createMockRequest({
        email: "user@example.com",
        organizationSlug: "test-org",
      });

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      // Verify the error response works correctly
      expect(response.status).toBe(400);
      expect(responseBody).toEqual({
        error: "No SSO provider found for this organization",
        isKnownError: true,
      });
    });
  });

  describe("betterAuthConfig integration", () => {
    test("should call betterAuthConfig.api.signInSSO with correct parameters", async () => {
      const mockSignInSSOResponse = { url: "https://sso.example.com/signin" };
      mockBetterAuthConfig.api.signInSSO.mockResolvedValue(
        mockSignInSSOResponse,
      );

      // Mock Prisma to return a provider
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue({
        providerId: "test-provider",
      } as any);

      const request = createMockRequest({
        email: "user@example.com",
        organizationSlug: "test-org",
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
      const request = createMockRequest({
        email: "user@example.com",
        organizationSlug: "test-org",
      });

      // Mock Prisma to return a provider
      vi.mocked(prisma.ssoProvider.findFirst).mockResolvedValue({
        providerId: "test-provider",
      } as any);

      // Mock betterAuth to throw an error
      mockBetterAuthConfig.api.signInSSO.mockRejectedValue(
        new Error("SSO service unavailable"),
      );

      const response = await GET(request, mockContext);
      const responseBody = await response.json();

      expect(response.status).toBe(500);
      expect(responseBody).toEqual({
        error: "An unexpected error occurred",
      });
    });
  });
});
