import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, handleMessagingWebhookRouteMock } = vi.hoisted(() => ({
  envMock: {
    TELEGRAM_BOT_TOKEN: "test-telegram-token" as string | undefined,
    TELEGRAM_BOT_SECRET_TOKEN: "test-telegram-secret" as string | undefined,
  },
  handleMessagingWebhookRouteMock: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/env", () => ({
  env: envMock,
}));

vi.mock("@/utils/messaging/chat-sdk/webhook-route", () => ({
  handleMessagingWebhookRoute: (...args: unknown[]) =>
    handleMessagingWebhookRouteMock(...args),
}));

import { POST } from "./route";

function createRequest() {
  return new Request("https://example.com/api/telegram/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-bot-api-secret-token": "test-telegram-secret",
    },
    body: JSON.stringify({ update_id: 1 }),
  });
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
