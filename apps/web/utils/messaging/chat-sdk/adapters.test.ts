import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSlackAdapterMock, createTeamsAdapterMock, mockEnv } = vi.hoisted(
  () => ({
    createSlackAdapterMock: vi.fn(() => ({ name: "slack" })),
    createTeamsAdapterMock: vi.fn(() => ({ name: "teams" })),
    mockEnv: {
      SLACK_SIGNING_SECRET: "slack-signing-secret" as string | undefined,
      SLACK_CLIENT_ID: undefined as string | undefined,
      SLACK_CLIENT_SECRET: undefined as string | undefined,
      TEAMS_BOT_APP_ID: "teams-app-id" as string | undefined,
      TEAMS_BOT_APP_PASSWORD: "teams-app-password" as string | undefined,
      TEAMS_BOT_APP_TENANT_ID: "teams-tenant-id" as string | undefined,
      TELEGRAM_BOT_TOKEN: undefined as string | undefined,
      TELEGRAM_BOT_SECRET_TOKEN: undefined as string | undefined,
    },
  }),
);

vi.mock("@/env", () => ({
  env: mockEnv,
}));

vi.mock("@chat-adapter/slack", () => ({
  createSlackAdapter: createSlackAdapterMock,
}));

vi.mock("@chat-adapter/teams", () => ({
  createTeamsAdapter: createTeamsAdapterMock,
}));

vi.mock("@chat-adapter/telegram", () => ({
  createTelegramAdapter: vi.fn(() => ({ name: "telegram" })),
}));

import { getMessagingAdapterRegistry } from "@/utils/messaging/chat-sdk/adapters";

describe("getMessagingAdapterRegistry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.inboxZeroMessagingAdapterRegistry = undefined;
    resetMockEnv();
  });

  it("configures Teams as a single-tenant bot", () => {
    getMessagingAdapterRegistry();

    expect(createTeamsAdapterMock).toHaveBeenCalledWith({
      appId: "teams-app-id",
      appPassword: "teams-app-password",
      appTenantId: "teams-tenant-id",
      appType: "SingleTenant",
    });
  });

  it("does not create the Teams adapter without a tenant id", () => {
    mockEnv.TEAMS_BOT_APP_TENANT_ID = undefined;

    const registry = getMessagingAdapterRegistry();

    expect(createTeamsAdapterMock).not.toHaveBeenCalled();
    expect(registry.typedAdapters.teams).toBeUndefined();
  });
});

function resetMockEnv() {
  mockEnv.SLACK_SIGNING_SECRET = "slack-signing-secret";
  mockEnv.SLACK_CLIENT_ID = undefined;
  mockEnv.SLACK_CLIENT_SECRET = undefined;
  mockEnv.TEAMS_BOT_APP_ID = "teams-app-id";
  mockEnv.TEAMS_BOT_APP_PASSWORD = "teams-app-password";
  mockEnv.TEAMS_BOT_APP_TENANT_ID = "teams-tenant-id";
  mockEnv.TELEGRAM_BOT_TOKEN = undefined;
  mockEnv.TELEGRAM_BOT_SECRET_TOKEN = undefined;
}
