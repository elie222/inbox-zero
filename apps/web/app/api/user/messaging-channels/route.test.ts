import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { findMany } = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/utils/middleware", () => ({
  withEmailAccount: (
    _scope: string,
    handler: (
      request: {
        auth: { emailAccountId: string };
      },
      context: unknown,
    ) => Promise<Response>,
  ) => handler,
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    messagingChannel: {
      findMany,
    },
  },
}));

vi.mock("@/env", () => ({
  env: {
    SLACK_CLIENT_ID: "slack-client-id",
    SLACK_CLIENT_SECRET: "slack-client-secret",
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "whatsapp-verify-token",
    WHATSAPP_APP_SECRET: "whatsapp-app-secret",
    TELEGRAM_WEBHOOK_SECRET: "telegram-secret",
  },
}));

import { GET } from "./route";

describe("messaging channels route", () => {
  const context = { params: Promise.resolve({}) } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
  });

  it("returns configured providers including WhatsApp", async () => {
    const response = await GET(
      { auth: { emailAccountId: "email-1" } } as any,
      context,
    );

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.availableProviders).toEqual(["SLACK", "WHATSAPP", "TELEGRAM"]);
  });
});
