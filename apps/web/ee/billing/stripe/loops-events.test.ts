import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleLoopsEvents } from "./loops-events";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("test");

// Mock the logger
vi.mock("@/utils/logger", () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  createContact,
  completedTrial,
  startedTrial,
  cancelledPremium,
} from "@inboxzero/loops";

describe("handleLoopsEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockCurrentPremium = {
    stripeSubscriptionStatus: null,
    stripeTrialEnd: null,
    tier: null,
    users: [{ email: "user@example.com", name: "John Doe" }],
    admins: [],
  };

  const mockNewSubscription = {
    status: "active",
    trial_end: null,
  };

  describe("Trial started scenarios", () => {
    it("should create contact when trial starts for new user", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: null, // No previous subscription
      };

      const newSubscription = {
        ...mockNewSubscription,
        trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days in future
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(createContact).toHaveBeenCalledWith("user@example.com", "John");
    });

    it("should not create contact when trial_end is in the past", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: null,
      };

      const newSubscription = {
        ...mockNewSubscription,
        trial_end: Math.floor(Date.now() / 1000) - 1000, // Past timestamp
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(createContact).not.toHaveBeenCalled();
    });

    it("should not create contact when user already has subscription status", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: "active", // Already has subscription
      };

      const newSubscription = {
        ...mockNewSubscription,
        trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(createContact).not.toHaveBeenCalled();
    });

    it("should handle user with no name", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        users: [{ email: "user@example.com", name: null }],
        stripeSubscriptionStatus: null,
      };

      const newSubscription = {
        ...mockNewSubscription,
        trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(createContact).toHaveBeenCalledWith("user@example.com", undefined);
    });
  });

  describe("Trial completion scenarios", () => {
    it("should call completedTrial when trial ends and subscription becomes active", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: "trialing",
        stripeTrialEnd: new Date(Date.now() + 1000 * 60 * 60), // 1 hour in future (was in trial)
      };

      const newSubscription = {
        status: "active",
        trial_end: Math.floor(Date.now() / 1000) - 1000, // Trial ended
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(completedTrial).toHaveBeenCalledWith(
        "user@example.com",
        "BUSINESS_MONTHLY",
      );
      expect(startedTrial).not.toHaveBeenCalled(); // Should not call direct upgrade
    });

    it("should not call completedTrial when tier is null", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: "trialing",
        stripeTrialEnd: new Date(Date.now() + 1000 * 60 * 60),
      };

      const newSubscription = {
        status: "active",
        trial_end: Math.floor(Date.now() / 1000) - 1000,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: null, // No tier
        logger,
      });

      expect(completedTrial).not.toHaveBeenCalled();
    });
  });

  describe("Direct upgrade scenarios", () => {
    it("should call startedTrial for first subscription (no previous status, no trial)", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: null, // First subscription
        stripeTrialEnd: null, // No trial
      };

      const newSubscription = {
        status: "active",
        trial_end: null,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(startedTrial).toHaveBeenCalledWith(
        "user@example.com",
        "BUSINESS_MONTHLY",
      );
      expect(completedTrial).not.toHaveBeenCalled(); // Should not call trial completion
    });

    it("should call startedTrial when transitioning from incomplete", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: "incomplete",
        stripeTrialEnd: null, // No trial
      };

      const newSubscription = {
        status: "active",
        trial_end: null,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(startedTrial).toHaveBeenCalledWith(
        "user@example.com",
        "BUSINESS_MONTHLY",
      );
      expect(completedTrial).not.toHaveBeenCalled();
    });

    it("should not call startedTrial when tier is null", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: null,
      };

      const newSubscription = {
        status: "active",
        trial_end: null,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: null, // No tier
        logger,
      });

      expect(startedTrial).not.toHaveBeenCalled();
    });

    it("should not call startedTrial when subscription is not active", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: null,
      };

      const newSubscription = {
        status: "trialing", // Not active
        trial_end: null,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(startedTrial).not.toHaveBeenCalled();
    });

    it("should not call startedTrial for users who were in trial", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: "trialing",
        stripeTrialEnd: new Date(Date.now() + 1000 * 60 * 60), // Was in trial
      };

      const newSubscription = {
        status: "active",
        trial_end: null,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      // Should call completedTrial, not startedTrial
      expect(startedTrial).not.toHaveBeenCalled();
      expect(completedTrial).toHaveBeenCalled();
    });
  });

  describe("Subscription cancelled scenarios", () => {
    it("should call cancelledPremium when subscription is canceled", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: "active",
      };

      const newSubscription = {
        status: "canceled",
        trial_end: null,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(cancelledPremium).toHaveBeenCalledWith("user@example.com");
    });

    it("should call cancelledPremium when subscription is unpaid", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: "active",
      };

      const newSubscription = {
        status: "unpaid",
        trial_end: null,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(cancelledPremium).toHaveBeenCalledWith("user@example.com");
    });

    it("should call cancelledPremium when subscription is incomplete_expired", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: "active",
      };

      const newSubscription = {
        status: "incomplete_expired",
        trial_end: null,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(cancelledPremium).toHaveBeenCalledWith("user@example.com");
    });

    it("should not call cancelledPremium when status hasn't changed", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: "canceled", // Already canceled
      };

      const newSubscription = {
        status: "canceled", // Same status
        trial_end: null,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(cancelledPremium).not.toHaveBeenCalled();
    });
  });

  describe("Edge cases", () => {
    it("should return early when currentPremium is null", async () => {
      await handleLoopsEvents({
        currentPremium: null,
        newSubscription: mockNewSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(createContact).not.toHaveBeenCalled();
      expect(completedTrial).not.toHaveBeenCalled();
      expect(startedTrial).not.toHaveBeenCalled();
      expect(cancelledPremium).not.toHaveBeenCalled();
    });

    it("should return early when no email found", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        users: [{ email: "", name: "John Doe" }], // Empty email
        admins: [],
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription: mockNewSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(createContact).not.toHaveBeenCalled();
      expect(completedTrial).not.toHaveBeenCalled();
      expect(startedTrial).not.toHaveBeenCalled();
      expect(cancelledPremium).not.toHaveBeenCalled();
    });

    it("should use admin email when user email is not available", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        users: [],
        admins: [{ email: "admin@example.com", name: "Admin User" }],
        stripeSubscriptionStatus: null,
      };

      const newSubscription = {
        ...mockNewSubscription,
        trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(createContact).toHaveBeenCalledWith("admin@example.com", "Admin");
    });

    it("should handle Loops function errors gracefully", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: null,
      };

      const newSubscription = {
        ...mockNewSubscription,
        trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      };

      // Mock createContact to throw an error
      vi.mocked(createContact).mockRejectedValueOnce(
        new Error("Loops API error"),
      );

      // Should not throw
      await expect(
        handleLoopsEvents({
          currentPremium,
          newSubscription,
          newTier: "BUSINESS_MONTHLY",
          logger,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe("Complex scenarios", () => {
    it("should handle trial start and not trigger payment events", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        stripeSubscriptionStatus: null,
      };

      const newSubscription = {
        status: "trialing", // Still in trial
        trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // Future trial end
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      // Should create contact for trial start
      expect(createContact).toHaveBeenCalledWith("user@example.com", "John");
      // Should NOT trigger payment events since still trialing
      expect(completedTrial).not.toHaveBeenCalled();
      expect(startedTrial).not.toHaveBeenCalled();
    });

    it("should handle user with multiple spaces in name", async () => {
      const currentPremium = {
        ...mockCurrentPremium,
        users: [{ email: "user@example.com", name: "John Middle Doe" }],
        stripeSubscriptionStatus: null,
      };

      const newSubscription = {
        ...mockNewSubscription,
        trial_end: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      };

      await handleLoopsEvents({
        currentPremium,
        newSubscription,
        newTier: "BUSINESS_MONTHLY",
        logger,
      });

      expect(createContact).toHaveBeenCalledWith("user@example.com", "John");
    });
  });
});
