import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted() to declare mocks that can be used in vi.mock factories
const { mockAcquireRateLimitToken, mockFetch, mockLoggerError } = vi.hoisted(
  () => ({
    mockAcquireRateLimitToken: vi.fn(),
    mockFetch: vi.fn(),
    mockLoggerError: vi.fn(),
  }),
);

// Mock env - must be before imports
vi.mock("@/env", () => ({
  env: {
    QSTASH_TOKEN: undefined as string | undefined,
    INTERNAL_API_KEY: "test-internal-key",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

// Mock rate limiting
vi.mock("@/utils/redis/rate-limit", () => ({
  acquireRateLimitToken: mockAcquireRateLimitToken,
}));

// Mock internal-api - use actual header name from implementation
vi.mock("@/utils/internal-api", () => ({
  INTERNAL_API_KEY_HEADER: "x-api-key",
  getInternalApiUrl: vi.fn(() => "http://localhost:3000"),
}));

// Mock logger
vi.mock("@/utils/logger", () => ({
  createScopedLogger: vi.fn(() => ({
    warn: vi.fn(),
    info: vi.fn(),
    error: mockLoggerError,
  })),
}));

// Mock fetch globally
vi.stubGlobal("fetch", mockFetch);

import { env } from "@/env";
import { publishToQstash, bulkPublishToQstash, publishToQstashQueue } from ".";

describe("QStash fallback behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAcquireRateLimitToken.mockResolvedValue(undefined);
    mockFetch.mockResolvedValue(Response.json({ success: true }));
    // Ensure QSTASH_TOKEN is undefined for fallback tests
    (env as { QSTASH_TOKEN: string | undefined }).QSTASH_TOKEN = undefined;
  });

  describe("publishToQstash", () => {
    it("should use emailAccountId from body for rate limiting", async () => {
      const body = {
        emailAccountId: "account-123",
        threadId: "thread-456",
      };

      await publishToQstash("/api/clean", body);

      expect(mockAcquireRateLimitToken).toHaveBeenCalledWith("account-123");
    });

    it("should fall back to 'global' when no emailAccountId in body", async () => {
      const body = {
        someOtherField: "value",
      };

      await publishToQstash("/api/clean", body);

      expect(mockAcquireRateLimitToken).toHaveBeenCalledWith("global");
    });

    it("should fall back to 'global' when emailAccountId is empty string", async () => {
      const body = {
        emailAccountId: "",
        threadId: "thread-456",
      };

      await publishToQstash("/api/clean", body);

      expect(mockAcquireRateLimitToken).toHaveBeenCalledWith("global");
    });

    it("should append /simple to the URL for fallback path", async () => {
      const body = { emailAccountId: "account-123" };

      await publishToQstash("/api/clean", body);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:3000/api/clean/simple",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("should include internal API key header in fallback request", async () => {
      const body = { emailAccountId: "account-123" };

      await publishToQstash("/api/clean", body);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "Content-Type": "application/json",
            "x-api-key": "test-internal-key",
          }),
        }),
      );
    });

    it("should JSON stringify the body in fallback request", async () => {
      const body = {
        emailAccountId: "account-123",
        threadId: "thread-456",
        markDone: true,
      };

      await publishToQstash("/api/clean", body);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify(body),
        }),
      );
    });
  });

  describe("error handling", () => {
    it("should propagate error when rate limit acquisition fails", async () => {
      const error = new Error(
        "Rate limit timeout after 30000ms for account-123",
      );
      mockAcquireRateLimitToken.mockRejectedValue(error);

      const body = { emailAccountId: "account-123" };

      await expect(publishToQstash("/api/clean", body)).rejects.toThrow(
        "Rate limit timeout after 30000ms for account-123",
      );

      // Verify fetch was NOT called since rate limiting failed
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("should log error when fetch fails but not throw", async () => {
      const fetchError = new Error("Network error");
      mockFetch.mockRejectedValue(fetchError);

      const body = { emailAccountId: "account-123" };

      // Should not throw - fire-and-forget with error logging
      await expect(
        publishToQstash("/api/clean", body),
      ).resolves.toBeUndefined();

      // Wait for the catch handler to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockLoggerError).toHaveBeenCalledWith(
        "Fallback fetch failed",
        expect.objectContaining({
          url: "http://localhost:3000/api/clean/simple",
          error: "Network error",
          rateLimitKey: "account-123",
        }),
      );
    });
  });

  describe("bulkPublishToQstash", () => {
    it("should rate limit each item sequentially in fallback mode", async () => {
      const items = [
        {
          url: "http://localhost:3000/api/clean",
          body: { emailAccountId: "account-1" },
        },
        {
          url: "http://localhost:3000/api/clean",
          body: { emailAccountId: "account-2" },
        },
        {
          url: "http://localhost:3000/api/clean",
          body: { emailAccountId: "account-3" },
        },
      ];

      await bulkPublishToQstash({ items });

      expect(mockAcquireRateLimitToken).toHaveBeenCalledTimes(3);
      expect(mockAcquireRateLimitToken).toHaveBeenNthCalledWith(1, "account-1");
      expect(mockAcquireRateLimitToken).toHaveBeenNthCalledWith(2, "account-2");
      expect(mockAcquireRateLimitToken).toHaveBeenNthCalledWith(3, "account-3");
    });

    it("should stop processing when rate limit fails mid-batch", async () => {
      mockAcquireRateLimitToken
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Rate limit exceeded"))
        .mockResolvedValueOnce(undefined);

      const items = [
        {
          url: "http://localhost:3000/api/clean",
          body: { emailAccountId: "account-1" },
        },
        {
          url: "http://localhost:3000/api/clean",
          body: { emailAccountId: "account-2" },
        },
        {
          url: "http://localhost:3000/api/clean",
          body: { emailAccountId: "account-3" },
        },
      ];

      await expect(bulkPublishToQstash({ items })).rejects.toThrow(
        "Rate limit exceeded",
      );

      // Verify only first fetch was called before failure
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("publishToQstashQueue", () => {
    it("should use rate limiting in fallback mode", async () => {
      const body = { emailAccountId: "queue-account-123" };

      await publishToQstashQueue({
        queueName: "test-queue",
        parallelism: 1,
        url: "http://localhost:3000/api/clean",
        body,
      });

      expect(mockAcquireRateLimitToken).toHaveBeenCalledWith(
        "queue-account-123",
      );
    });
  });
});

// Note: QStash client behavior (when QSTASH_TOKEN is set) is tested by:
// - The route tests which return 403 when QSTASH_TOKEN is set
// - The @upstash/qstash library's own test suite
