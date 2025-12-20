import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleWebhookError } from "@/utils/webhook/error-handler";
import { createScopedLogger } from "@/utils/logger";
import { trackError } from "@/utils/posthog";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/posthog", () => ({
  trackError: vi.fn(),
}));

describe("handleWebhookError", () => {
  const logger = createScopedLogger("test");
  const baseOptions = {
    email: "test@example.com",
    emailAccountId: "acc-123",
    url: "/api/google/webhook",
    logger,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Gmail errors", () => {
    it("tracks Gmail rate limit errors", async () => {
      const error = Object.assign(new Error("Rate limit exceeded"), {
        errors: [
          { reason: "rateLimitExceeded", message: "Rate Limit Exceeded" },
        ],
      });

      await handleWebhookError(error, baseOptions);

      expect(trackError).toHaveBeenCalledWith({
        email: "test@example.com",
        emailAccountId: "acc-123",
        errorType: "Gmail Rate Limit Exceeded",
        type: "api",
        url: "/api/google/webhook",
      });
    });

    it("tracks Gmail quota exceeded errors", async () => {
      const error = Object.assign(new Error("Quota exceeded"), {
        errors: [{ reason: "quotaExceeded", message: "Quota Exceeded" }],
      });

      await handleWebhookError(error, baseOptions);

      expect(trackError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorType: "Gmail Quota Exceeded",
        }),
      );
    });

    it("tracks Gmail insufficient permissions errors", async () => {
      const error = Object.assign(new Error("Insufficient permissions"), {
        errors: [{ reason: "insufficientPermissions" }],
      });

      await handleWebhookError(error, baseOptions);

      expect(trackError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorType: "Gmail Insufficient Permissions",
        }),
      );
    });
  });

  describe("Outlook errors", () => {
    it("tracks Outlook throttling errors (429)", async () => {
      const error = Object.assign(new Error("Too many requests"), {
        statusCode: 429,
        code: "TooManyRequests",
      });

      await handleWebhookError(error, {
        ...baseOptions,
        url: "/api/outlook/webhook",
      });

      expect(trackError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorType: "Outlook Rate Limit",
          url: "/api/outlook/webhook",
        }),
      );
    });

    it("tracks Outlook ApplicationThrottled errors", async () => {
      const error = Object.assign(new Error("Application throttled"), {
        code: "ApplicationThrottled",
      });

      await handleWebhookError(error, {
        ...baseOptions,
        url: "/api/outlook/webhook",
      });

      expect(trackError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorType: "Outlook Rate Limit",
        }),
      );
    });

    it("tracks Outlook MailboxConcurrency errors", async () => {
      const error = new Error("MailboxConcurrency limit exceeded");

      await handleWebhookError(error, {
        ...baseOptions,
        url: "/api/outlook/webhook",
      });

      expect(trackError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorType: "Outlook Rate Limit",
        }),
      );
    });
  });

  describe("Unknown errors", () => {
    it("does not track unknown errors in PostHog (logs only)", async () => {
      const error = new Error("Some unexpected error");

      await handleWebhookError(error, baseOptions);

      // Unknown errors should not be tracked via PostHog
      expect(trackError).not.toHaveBeenCalled();
    });

    it("handles errors without crashing when email account is missing", async () => {
      const error = new Error("Unexpected error");

      // Should not throw
      await expect(
        handleWebhookError(error, {
          email: "unknown@example.com",
          emailAccountId: "unknown",
          url: "/api/google/webhook",
          logger,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("Error type detection", () => {
    it("handles error objects with nested structure", async () => {
      const error = {
        errors: [
          {
            reason: "rateLimitExceeded",
            message: "Rate Limit Exceeded",
            domain: "usageLimits",
          },
        ],
        code: 429,
        message: "Rate Limit Exceeded",
      };

      await handleWebhookError(error, baseOptions);

      expect(trackError).toHaveBeenCalledWith(
        expect.objectContaining({
          errorType: "Gmail Rate Limit Exceeded",
        }),
      );
    });
  });
});
