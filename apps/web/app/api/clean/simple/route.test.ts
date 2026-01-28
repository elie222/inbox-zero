// Mock server-only as per testing guidelines
vi.mock("server-only", () => ({}));

// Mock env
vi.mock("@/env", () => ({
  env: {
    QSTASH_TOKEN: undefined,
    INTERNAL_API_KEY: "test-internal-key",
    EMAIL_ENCRYPT_SECRET: "test-secret",
    EMAIL_ENCRYPT_SALT: "test-salt",
  },
}));

// Mock encryption to avoid env issues
vi.mock("@/utils/encryption", () => ({
  encrypt: vi.fn((val) => val),
  decrypt: vi.fn((val) => val),
}));

// Mock auth to avoid encryption chain
vi.mock("@/utils/auth", () => ({}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(() => new Headers()),
}));

// Mock Redis
vi.mock("@/utils/redis", () => ({
  redis: null,
}));

// Mock internal-api
vi.mock("@/utils/internal-api", () => ({
  isValidInternalApiKey: vi.fn(),
}));

// Mock Prisma
vi.mock("@/utils/prisma", () => ({
  default: {},
}));

// Mock heavy dependencies to avoid loading the entire app
vi.mock("@/utils/gmail/thread", () => ({
  getThreadMessages: vi.fn(),
}));

vi.mock("@/utils/gmail/client", () => ({
  getGmailClientWithRefresh: vi.fn(),
}));

vi.mock("@/utils/user/get", () => ({
  getEmailAccountWithAiAndTokens: vi.fn(),
  getUserPremium: vi.fn(),
}));

vi.mock("@/utils/ai/clean/ai-clean", () => ({
  aiClean: vi.fn(),
}));

vi.mock("@/utils/redis/clean", () => ({
  saveThread: vi.fn(),
  updateThread: vi.fn(),
}));

vi.mock("@/utils/upstash", () => ({
  publishToQstash: vi.fn(),
}));

vi.mock("@/utils/premium", () => ({
  isActivePremium: vi.fn(),
}));

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { env } from "@/env";
import { POST } from "./route";

const mockIsValidInternalApiKey = vi.mocked(isValidInternalApiKey);

describe("/api/clean/simple", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset env mock
    (env as { QSTASH_TOKEN: string | undefined }).QSTASH_TOKEN = undefined;
  });

  const createMockRequest = (body: Record<string, unknown>) => {
    return new NextRequest("http://localhost/api/clean/simple", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "test-api-key",
      },
      body: JSON.stringify(body),
    });
  };

  const validBody = {
    emailAccountId: "test-email-account-id",
    threadId: "test-thread-id",
    markedDoneLabelId: "label-1",
    processedLabelId: "label-2",
    jobId: "job-1",
    action: "ARCHIVE",
    skips: {
      reply: true,
      starred: true,
      calendar: true,
    },
  };

  describe("QStash guard", () => {
    test("should return 403 when QSTASH_TOKEN is set", async () => {
      (env as { QSTASH_TOKEN: string | undefined }).QSTASH_TOKEN =
        "qstash-token";

      const request = createMockRequest(validBody);
      const response = await POST(request);
      const responseBody = await response.json();

      expect(response.status).toBe(403);
      expect(responseBody.error).toBe(
        "Qstash is set. This endpoint is disabled.",
      );
    });

    test("should proceed when QSTASH_TOKEN is not set", async () => {
      mockIsValidInternalApiKey.mockReturnValue(false);

      const request = createMockRequest(validBody);
      const response = await POST(request);

      // Should get past QStash check and fail on API key
      expect(response.status).toBe(401);
    });
  });

  describe("API key validation", () => {
    test("should return 401 when API key is invalid", async () => {
      mockIsValidInternalApiKey.mockReturnValue(false);

      const request = createMockRequest(validBody);
      const response = await POST(request);
      const responseBody = await response.json();

      expect(response.status).toBe(401);
      expect(responseBody.error).toBe("Invalid API key");
    });

    test("should proceed when API key is valid", async () => {
      mockIsValidInternalApiKey.mockReturnValue(true);

      // Will fail on next step (missing mocks for cleanThread dependencies)
      // but this proves API key validation passed
      const request = createMockRequest(validBody);
      const response = await POST(request);

      // Should get past API key check
      expect(response.status).not.toBe(401);
      expect(mockIsValidInternalApiKey).toHaveBeenCalled();
    });
  });

  describe("Input validation", () => {
    test("should return 400 when body is missing required fields", async () => {
      mockIsValidInternalApiKey.mockReturnValue(true);

      const request = createMockRequest({});
      const response = await POST(request);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody.error).toBeDefined();
    });

    test("should return 400 when action is invalid", async () => {
      mockIsValidInternalApiKey.mockReturnValue(true);

      const request = createMockRequest({
        ...validBody,
        action: "INVALID_ACTION",
      });
      const response = await POST(request);
      const responseBody = await response.json();

      expect(response.status).toBe(400);
      expect(responseBody.error).toBeDefined();
    });
  });
});
