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

vi.mock("@/utils/middleware", () => ({
  withError:
    (
      _scope: string,
      handler: (request: Request, ...args: unknown[]) => Promise<Response>,
    ) =>
    (request: Request, ...args: unknown[]) =>
      handler(request, ...args),
}));

vi.mock("@/utils/internal-api", () => ({
  isValidInternalApiKey: isValidInternalApiKeyMock,
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(),
    },
    newsletter: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/utils/ai/choose-rule/ai-detect-recurring-pattern", () => ({
  aiDetectRecurringPattern: vi.fn(),
}));

vi.mock("@/utils/email", () => ({
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
});

function createRequest() {
  const request = new Request(
    "https://example.com/api/ai/analyze-sender-pattern",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        emailAccountId: "email-account-1",
        from: "sender@example.com",
      }),
    },
  ) as Request & {
    logger: {
      error: ReturnType<typeof vi.fn>;
    };
  };

  request.logger = {
    error: vi.fn(),
  };

  return request;
}
