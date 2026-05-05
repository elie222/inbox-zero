import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

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

  it("does not log the raw body when the internal API key is invalid", async () => {
    isValidInternalApiKeyMock.mockReturnValue(false);
    const logger = {
      error: vi.fn(),
    };

    await POST(
      createRequest({
        logger,
        body: {
          emailAccountId: "email-account-1",
          from: "sender@example.com",
          attackerControlled: "do-not-log-this-secret",
        },
      }) as never,
    );

    expect(logger.error).toHaveBeenCalledWith(
      "Invalid API key for sender pattern analysis",
      {
        bodyKeys: ["emailAccountId", "from", "attackerControlled"],
      },
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(
      "do-not-log-this-secret",
    );
    expect(afterMock).not.toHaveBeenCalled();
  });
});

function createRequest({
  logger,
  body,
}: {
  logger: {
    error: ReturnType<typeof vi.fn>;
  };
  body: Record<string, unknown>;
}) {
  const request = new Request(
    "https://example.com/api/ai/analyze-sender-pattern",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  ) as Request & {
    logger: typeof logger;
  };

  request.logger = logger;

  return request;
}
