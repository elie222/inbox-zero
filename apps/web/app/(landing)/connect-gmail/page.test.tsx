import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import prisma from "@/utils/__mocks__/prisma";

// Mock dependencies
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/utils/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/utils/prisma");

import { auth } from "@/utils/auth";

describe("ConnectGmailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAuth = auth as any;

  describe("Authentication checks", () => {
    it("should redirect to /login when user is not authenticated", async () => {
      mockAuth.mockResolvedValue(null);

      const { default: ConnectGmailPage } = await import("./page");

      await ConnectGmailPage({});

      expect(redirect).toHaveBeenCalledWith("/login");
    });

    it("should redirect to /login when user is authenticated but not found in database", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123" },
      });

      prisma.user.findUnique.mockResolvedValue(null);

      const { default: ConnectGmailPage } = await import("./page");

      await ConnectGmailPage({});

      expect(redirect).toHaveBeenCalledWith("/login");
    });
  });

  describe("Onboarding status checks", () => {
    it("should redirect to / when user has completed onboarding", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123" },
      });

      prisma.user.findUnique.mockResolvedValue({
        completedOnboardingAt: new Date(),
        name: "John Doe",
        email: "john@example.com",
      });

      const { default: ConnectGmailPage } = await import("./page");

      await ConnectGmailPage({});

      expect(redirect).toHaveBeenCalledWith("/");
    });

    it("should render ConnectGmailContent when user has not completed onboarding", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123" },
      });

      prisma.user.findUnique.mockResolvedValue({
        completedOnboardingAt: null,
        name: "John Doe",
        email: "john@example.com",
      });

      const { default: ConnectGmailPage } = await import("./page");

      // This test would need to be updated to actually render the component
      // For now, we're testing the logic flow
      await ConnectGmailPage({});

      // Should not redirect when onboarding is not complete
      expect(redirect).not.toHaveBeenCalledWith("/");
    });
  });

  describe("User data handling", () => {
    it("should handle user with name", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123" },
      });

      prisma.user.findUnique.mockResolvedValue({
        completedOnboardingAt: null,
        name: "John Doe",
        email: "john@example.com",
      });

      const { default: ConnectGmailPage } = await import("./page");

      await ConnectGmailPage({});

      // Verify user lookup was called with correct ID
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-123" },
        select: {
          completedOnboardingAt: true,
          name: true,
          email: true,
        },
      });
    });

    it("should handle user without name", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123" },
      });

      prisma.user.findUnique.mockResolvedValue({
        completedOnboardingAt: null,
        name: null,
        email: "john@example.com",
      });

      const { default: ConnectGmailPage } = await import("./page");

      await ConnectGmailPage({});

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: "user-123" },
        select: {
          completedOnboardingAt: true,
          name: true,
          email: true,
        },
      });
    });
  });

  describe("Error handling", () => {
    it("should handle database errors gracefully", async () => {
      mockAuth.mockResolvedValue({
        user: { id: "user-123" },
      });

      prisma.user.findUnique.mockRejectedValue(new Error("Database error"));

      const { default: ConnectGmailPage } = await import("./page");

      await expect(ConnectGmailPage({})).rejects.toThrow("Database error");
    });

    it("should handle auth errors gracefully", async () => {
      mockAuth.mockRejectedValue(new Error("Auth error"));

      const { default: ConnectGmailPage } = await import("./page");

      await expect(ConnectGmailPage({})).rejects.toThrow("Auth error");
    });
  });
});
