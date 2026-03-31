import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { envMock, handleMessagingWebhookRouteMock } = vi.hoisted(() => ({
  envMock: {
    TELEGRAM_BOT_TOKEN: "test-telegram-token" as string | undefined,
    TELEGRAM_BOT_SECRET_TOKEN: "test-telegram-secret" as string | undefined,
  },
  handleMessagingWebhookRouteMock: vi.fn(),
}));

vi.mock("@/utils/middleware", () => ({
  withError: (
    scopeOrHandler: string | ((request: Request) => Promise<Response>),
    maybeHandler?: (request: Request) => Promise<Response>,
  ) => {
    if (typeof scopeOrHandler === "string") {
      return maybeHandler as (request: Request) => Promise<Response>;
    }
    return scopeOrHandler;
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/messaging/chat-sdk/webhook-route", () => ({
  handleMessagingWebhookRoute: (...args: unknown[]) =>
    handleMessagingWebhookRouteMock(...args),
}));

import { POST } from "./route";

function createRequest() {
  const request = new Request("https://example.com/api/telegram/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "test-telegram-secret",
    },
    body: JSON.stringify({ update_id: 1 }),
  }) as Request & {
    logger: {
      warn: ReturnType<typeof vi.fn>;
      error: ReturnType<typeof vi.fn>;
      info: ReturnType<typeof vi.fn>;
      trace: ReturnType<typeof vi.fn>;
    };
  };

  request.logger = {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
  };

  return request;
}

describe("Telegram events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    envMock.TELEGRAM_BOT_TOKEN = "test-telegram-token";
    envMock.TELEGRAM_BOT_SECRET_TOKEN = "test-telegram-secret";
    handleMessagingWebhookRouteMock.mockResolvedValue(
      NextResponse.json({ ok: true }),
    );
  });

  it("delegates to the shared webhook handler when the secret token is configured", async () => {
    const request = createRequest();

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(handleMessagingWebhookRouteMock).toHaveBeenCalledTimes(1);
    expect(handleMessagingWebhookRouteMock).toHaveBeenCalledWith({
      request,
      platform: "telegram",
      isConfigured: true,
      notConfiguredError: "Telegram not configured",
      adapterUnavailableError: "Telegram adapter unavailable",
      webhookUnavailableError: "Telegram webhook unavailable",
    });
  });
});
