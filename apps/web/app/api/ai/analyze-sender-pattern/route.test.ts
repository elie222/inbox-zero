import { beforeEach, describe, expect, it, vi } from "vitest";

const { afterMock, headersMock, isValidInternalApiKeyMock } = vi.hoisted(
  () => ({
    afterMock: vi.fn(),
    headersMock: vi.fn(),
    isValidInternalApiKeyMock: vi.fn(),
  }),
);

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return {
    ...original,
    after: afterMock,
  };
});

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/internal-api", () => ({
  isValidInternalApiKey: isValidInternalApiKeyMock,
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(),
    },
    newsletter: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/utils/ai/choose-rule/ai-detect-recurring-pattern", () => ({
  aiDetectRecurringPattern: vi.fn(),
}));

vi.mock("@/utils/email", () => ({
  canonicalizeEmailAddress: vi.fn((value: string) => value.toLowerCase()),
  extractEmailAddress: vi.fn((value: string) => value),
}));

vi.mock("@/utils/get-email-from-message", () => ({
  getEmailForLLM: vi.fn(),
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn(),
}));

vi.mock("@/utils/rule/check-sender-rule-history", () => ({
  checkSenderRuleHistory: vi.fn(),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));

import { POST } from "./route";
import prisma from "@/utils/prisma";

describe("analyze sender pattern route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    headersMock.mockResolvedValue(new Headers());
    isValidInternalApiKeyMock.mockReturnValue(true);
  });

  it("returns 401 when the internal API key is invalid", async () => {
    isValidInternalApiKeyMock.mockReturnValue(false);

    const response = await POST(createRequest() as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid API key",
    });
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("skips analysis when any sender casing variant was already analyzed", async () => {
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      id: "email-account-1",
    } as any);
    vi.mocked(prisma.newsletter.findFirst).mockResolvedValue({
      id: "newsletter-1",
      patternAnalyzed: true,
    } as any);

    const response = await POST(createRequest() as never);

    expect(response.status).toBe(200);
    const processInBackground = afterMock.mock.calls[0]?.[0];
    if (!processInBackground) throw new Error("Background process not queued");
    await processInBackground();
    expect(prisma.newsletter.findFirst).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-1",
        email: {
          equals: "sender@example.com",
          mode: "insensitive",
        },
        patternAnalyzed: true,
      },
    });
  });
});

function createRequest() {
  return new Request("https://example.com/api/ai/analyze-sender-pattern", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      emailAccountId: "email-account-1",
      from: "sender@example.com",
    }),
  });
}
