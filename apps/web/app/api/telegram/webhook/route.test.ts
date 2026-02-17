import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/middleware", async () => {
  const { createScopedLogger } = await import("@/utils/logger");

  return {
    withError:
      (
        _scope: string,
        handler: (
          request: NextRequest & {
            logger: ReturnType<typeof createScopedLogger>;
          },
          context: any,
        ) => any,
      ) =>
      async (request: NextRequest, context: any) => {
        const logger = createScopedLogger("test-telegram-webhook-route");
        return handler(Object.assign(request, { logger }), context);
      },
  };
});

const mockVerifyTelegramWebhookToken = vi.fn();
vi.mock("@inboxzero/telegram", () => ({
  verifyTelegramWebhookToken: (...args: unknown[]) =>
    mockVerifyTelegramWebhookToken(...args),
}));

const mockProcessTelegramEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/utils/telegram/process-telegram-event", () => ({
  processTelegramEvent: (...args: unknown[]) =>
    mockProcessTelegramEvent(...args),
}));

vi.mock("@/env", () => ({
  env: {
    TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
  },
}));

import { POST } from "./route";

describe("telegram webhook route", () => {
  const context = { params: Promise.resolve({}) } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects POST when bot_id query parameter is missing", async () => {
    const request = new NextRequest(
      "https://example.com/api/telegram/webhook",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "telegram-secret",
        },
        body: JSON.stringify({ update_id: 1 }),
      },
    );

    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing or invalid bot ID");
  });

  it("rejects POST when webhook token is invalid", async () => {
    mockVerifyTelegramWebhookToken.mockReturnValue(false);

    const request = new NextRequest(
      "https://example.com/api/telegram/webhook?bot_id=12345",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "bad-secret",
        },
        body: JSON.stringify({ update_id: 1 }),
      },
    );

    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Invalid webhook token");
    expect(mockProcessTelegramEvent).not.toHaveBeenCalled();
  });

  it("accepts POST when webhook token is valid", async () => {
    mockVerifyTelegramWebhookToken.mockReturnValue(true);

    const request = new NextRequest(
      "https://example.com/api/telegram/webhook?bot_id=12345",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "telegram-secret",
        },
        body: JSON.stringify({ update_id: 1, message: { message_id: 1 } }),
      },
    );

    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
