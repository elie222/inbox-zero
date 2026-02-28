import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMessagingLinkCodeAction } from "@/utils/actions/messaging-channels";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const { mockEnv, generateMessagingLinkCodeMock } = vi.hoisted(() => ({
  mockEnv: {
    TEAMS_BOT_APP_ID: "teams-app-id",
    TEAMS_BOT_APP_PASSWORD: "teams-app-password",
    TELEGRAM_BOT_TOKEN: "telegram-bot-token",
  },
  generateMessagingLinkCodeMock: vi.fn(() => "test-link-code"),
}));

vi.mock("@/env", () => ({
  env: mockEnv,
}));

vi.mock("@/utils/messaging/chat-sdk/link-code", () => ({
  LINKABLE_MESSAGING_PROVIDERS: ["TEAMS", "TELEGRAM"],
  generateMessagingLinkCode: (...args: unknown[]) =>
    generateMessagingLinkCodeMock(...args),
}));

describe("createMessagingLinkCodeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockEnv.TEAMS_BOT_APP_ID = "teams-app-id";
    mockEnv.TEAMS_BOT_APP_PASSWORD = "teams-app-password";
    mockEnv.TELEGRAM_BOT_TOKEN = "telegram-bot-token";

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
  });

  it("returns a Teams connect code when Teams is configured", async () => {
    const result = await createMessagingLinkCodeAction(
      "email-account-1" as any,
      {
        provider: "TEAMS",
      },
    );

    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({
      code: "test-link-code",
      provider: "TEAMS",
      expiresInSeconds: 600,
    });
    expect(generateMessagingLinkCodeMock).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      provider: "TEAMS",
    });
  });

  it("returns an error when Teams is not configured", async () => {
    mockEnv.TEAMS_BOT_APP_ID = undefined;

    const result = await createMessagingLinkCodeAction(
      "email-account-1" as any,
      {
        provider: "TEAMS",
      },
    );

    expect(result?.serverError).toBe("Teams integration is not configured");
    expect(generateMessagingLinkCodeMock).not.toHaveBeenCalled();
  });

  it("returns an error when Telegram is not configured", async () => {
    mockEnv.TELEGRAM_BOT_TOKEN = undefined;

    const result = await createMessagingLinkCodeAction(
      "email-account-1" as any,
      {
        provider: "TELEGRAM",
      },
    );

    expect(result?.serverError).toBe("Telegram integration is not configured");
    expect(generateMessagingLinkCodeMock).not.toHaveBeenCalled();
  });
});
