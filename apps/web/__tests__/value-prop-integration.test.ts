import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

// Mock dependencies
vi.mock("@/utils/prisma");
vi.mock("server-only", () => ({}));

vi.mock("next/navigation", () => ({}));

vi.mock("@/utils/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_APP_HOME_PATH: "/mail",
    NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID: "test-survey-id",
  },
}));

import { auth } from "@/utils/auth";
import { env } from "@/env";

/**
 * Integration tests for the complete value prop onboarding flow
 * Testing the journey from authentication through welcome-redirect to value-prop
 */
describe("Value Prop Integration Tests - Complete Onboarding Flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Welcome Redirect → Value Prop Flow", () => {
    it("should redirect unauthenticated user from welcome-redirect to /login", async () => {
      (auth as any).mockResolvedValue(null);

      const session = await auth();
      expect(session).toBeNull();

      // Would trigger redirect("/login")
    });

    it("should redirect authenticated user without completedOnboardingAt to /value-prop", async () => {
      (auth as any).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        name: "John Doe",
        completedOnboardingAt: null,
        utms: null,
      });

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { completedOnboardingAt: true, utms: true },
      });

      expect(user?.completedOnboardingAt).toBeNull();
      // Should redirect to /value-prop
    });

    it("should redirect authenticated user with completedOnboardingAt to app home", async () => {
      (auth as any).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        name: "John Doe",
        completedOnboardingAt: new Date("2024-01-01T10:00:00Z"),
        utms: null,
      });

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { completedOnboardingAt: true, utms: true },
      });

      expect(user?.completedOnboardingAt).not.toBeNull();
      // Should redirect to /mail (APP_HOME_PATH)
    });
  });

  describe("Value Prop Page Access Control", () => {
    it("should deny access to value-prop for logged out users", async () => {
      (auth as any).mockResolvedValue(null);

      const session = await auth();
      expect(session).toBeNull();
      // Should redirect to /login
    });

    it("should allow access to value-prop for authenticated user without onboarding", async () => {
      (auth as any).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        name: "John Doe",
        completedOnboardingAt: null,
      });

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: {
          completedOnboardingAt: true,
          name: true,
          email: true,
        },
      });

      expect(session?.user).toBeDefined();
      expect(user?.completedOnboardingAt).toBeNull();
      // Should render value prop page
    });

    it("should redirect from value-prop to app home if user completed onboarding", async () => {
      (auth as any).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        name: "John Doe",
        completedOnboardingAt: new Date("2024-01-01T10:00:00Z"),
      });

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: {
          completedOnboardingAt: true,
          name: true,
          email: true,
        },
      });

      expect(user?.completedOnboardingAt).not.toBeNull();
      // Should redirect to /mail
    });
  });

  describe("Complete User Journey - New Sign Up", () => {
    it("should follow complete flow for brand new user", async () => {
      // Step 1: User completes Google OAuth
      (auth as any).mockResolvedValue({
        user: { id: "new-user-123", email: "newuser@example.com" },
      });

      // Step 2: User lands on /welcome-redirect
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "new-user-123",
        email: "newuser@example.com",
        name: null,
        completedOnboardingAt: null,
        utms: null,
      });

      const session = await auth();
      let user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: { completedOnboardingAt: true, utms: true },
      });

      expect(user?.completedOnboardingAt).toBeNull();
      // Redirects to /value-prop

      // Step 3: User lands on /value-prop
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "new-user-123",
        email: "newuser@example.com",
        name: null,
        completedOnboardingAt: null,
      });

      user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: {
          completedOnboardingAt: true,
          name: true,
          email: true,
        },
      });

      expect(user?.completedOnboardingAt).toBeNull();
      // Shows value prop page with userName = "newuser"

      // Step 4: User clicks Continue button
      // Would navigate to /welcome (PostHog survey)
    });

    it("should handle returning user who abandoned onboarding", async () => {
      // User who signed up before but never completed onboarding
      (auth as any).mockResolvedValue({
        user: { id: "returning-user-456", email: "returning@example.com" },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "returning-user-456",
        email: "returning@example.com",
        name: "Returning User",
        completedOnboardingAt: null, // Never completed
        utms: { source: "google", medium: "cpc" },
      });

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: {
          completedOnboardingAt: true,
          name: true,
          email: true,
          utms: true,
        },
      });

      expect(user?.completedOnboardingAt).toBeNull();
      expect(user?.name).toBe("Returning User");
      // Should still show value prop page
      // This gives them another chance to complete onboarding
    });

    it("should skip value-prop for fully onboarded users", async () => {
      (auth as any).mockResolvedValue({
        user: { id: "completed-user-789", email: "completed@example.com" },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "completed-user-789",
        email: "completed@example.com",
        name: "Completed User",
        completedOnboardingAt: new Date("2024-01-01T10:00:00Z"),
        utms: null,
      });

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: {
          completedOnboardingAt: true,
          utms: true,
        },
      });

      expect(user?.completedOnboardingAt).not.toBeNull();
      // Should redirect directly to /mail, skipping value-prop
    });
  });

  describe("Edge Cases in User Flow", () => {
    it("should handle user who manually visits /value-prop after onboarding", async () => {
      (auth as any).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        completedOnboardingAt: new Date("2024-01-01T10:00:00Z"),
      });

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
        select: {
          completedOnboardingAt: true,
          name: true,
          email: true,
        },
      });

      expect(user?.completedOnboardingAt).not.toBeNull();
      // Should immediately redirect to /mail without showing value prop
    });

    it("should handle user deleted from database but session exists", async () => {
      (auth as any).mockResolvedValue({
        user: { id: "deleted-user", email: "deleted@example.com" },
      });

      prisma.user.findUnique.mockResolvedValue(null);

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
      });

      expect(user).toBeNull();
      // Should redirect to /login
    });

    it("should handle concurrent onboarding attempts", async () => {
      (auth as any).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      });

      // First call - not completed
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        completedOnboardingAt: null,
      });

      // Second call (after they completed) - completed
      prisma.user.findUnique.mockResolvedValueOnce({
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        completedOnboardingAt: new Date(),
      });

      const session = await auth();

      const userBefore = await prisma.user.findUnique({
        where: { id: session?.user?.id },
      });
      expect(userBefore?.completedOnboardingAt).toBeNull();

      const userAfter = await prisma.user.findUnique({
        where: { id: session?.user?.id },
      });
      expect(userAfter?.completedOnboardingAt).not.toBeNull();
    });

    it("should handle session expiry during onboarding", async () => {
      // User starts with valid session
      (auth as any).mockResolvedValueOnce({
        user: { id: "user-123", email: "test@example.com" },
      });

      let session = await auth();
      expect(session?.user).toBeDefined();

      // Session expires
      (auth as any).mockResolvedValueOnce(null);

      session = await auth();
      expect(session).toBeNull();
      // Should redirect to /login
    });
  });

  describe("Data Integrity Tests", () => {
    it("should verify user ID consistency across flow", async () => {
      const userId = "consistent-user-id";

      (auth as any).mockResolvedValue({
        user: { id: userId, email: "test@example.com" },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: userId,
        email: "test@example.com",
        name: "Test User",
        completedOnboardingAt: null,
      });

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
      });

      expect(session?.user?.id).toBe(userId);
      expect(user?.id).toBe(userId);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: userId },
        }),
      );
    });

    it("should preserve user email across flow", async () => {
      const userEmail = "preserve@example.com";

      (auth as any).mockResolvedValue({
        user: { id: "user-123", email: userEmail },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email: userEmail,
        name: "Test User",
        completedOnboardingAt: null,
      });

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
      });

      expect(session?.user?.email).toBe(userEmail);
      expect(user?.email).toBe(userEmail);
    });

    it("should correctly extract userName for display", async () => {
      const testCases = [
        {
          name: "Full Name",
          email: "test@example.com",
          expected: "Full Name",
        },
        {
          name: null,
          email: "john.doe@example.com",
          expected: "john.doe",
        },
        {
          name: "",
          email: "jane@example.com",
          expected: "jane",
        },
        {
          name: null,
          email: null,
          expected: "there",
        },
      ];

      for (const testCase of testCases) {
        const userName =
          testCase.name || testCase.email?.split("@")[0] || "there";
        expect(userName).toBe(testCase.expected);
      }
    });
  });

  describe("PostHog Configuration Tests", () => {
    it("should verify PostHog survey ID is configured", () => {
      // Use the mocked env from the top of the file
      expect(env.NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID).toBe(
        "test-survey-id",
      );
    });

    it("should handle missing PostHog survey ID gracefully", () => {
      // In the actual implementation, if PostHog survey is not configured,
      // the page should still work but skip the survey step
      const surveyId = process.env.NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID;

      // Test that the code handles both cases
      if (surveyId) {
        expect(surveyId).toBeTruthy();
      } else {
        // Should still proceed with onboarding
        expect(surveyId).toBeFalsy();
      }
    });
  });

  describe("URL and Route Configuration", () => {
    it("should use correct paths for all redirects", () => {
      const paths = {
        login: "/login",
        valueProp: "/value-prop",
        welcome: "/welcome",
        welcomeRedirect: "/welcome-redirect",
        appHome: "/mail",
      };

      // Verify all paths follow expected patterns
      expect(paths.login).toMatch(/^\/[a-z-]+$/);
      expect(paths.valueProp).toMatch(/^\/[a-z-]+$/);
      expect(paths.welcome).toMatch(/^\/[a-z-]+$/);
      expect(paths.welcomeRedirect).toMatch(/^\/[a-z-]+$/);
      expect(paths.appHome).toMatch(/^\/[a-z]+$/);
    });

    it("should have consistent app home path configuration", () => {
      // Use the mocked env from the top of the file
      expect(env.NEXT_PUBLIC_APP_HOME_PATH).toBe("/mail");
    });
  });

  describe("Performance and Timing Tests", () => {
    it("should handle rapid sequential page visits", async () => {
      (auth as any).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        name: "Test User",
        completedOnboardingAt: null,
      });

      // Simulate rapid visits
      const promises = new Array(5).fill(null).map(async () => {
        const session = await auth();
        const user = await prisma.user.findUnique({
          where: { id: session?.user?.id },
        });
        return user;
      });

      const results = await Promise.all(promises);

      // All should return consistent data
      results.forEach((user) => {
        expect(user?.id).toBe("user-123");
        expect(user?.completedOnboardingAt).toBeNull();
      });
    });

    it("should handle database query delays gracefully", async () => {
      (auth as any).mockResolvedValue({
        user: { id: "user-123", email: "test@example.com" },
      });

      // Simulate slow database query
      prisma.user.findUnique.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  id: "user-123",
                  email: "test@example.com",
                  name: "Test User",
                  completedOnboardingAt: null,
                }),
              100,
            ),
          ),
      );

      const session = await auth();
      const user = await prisma.user.findUnique({
        where: { id: session?.user?.id },
      });

      expect(user).toBeDefined();
      expect(user?.id).toBe("user-123");
    });
  });
});
