import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  mockGetOAuthCodeResult,
  mockAcquireOAuthCodeLock,
  mockSetOAuthCodeResult,
  mockClearOAuthCode,
  mockSyncSlackInstallation,
  mockSendSlackOnboardingDirectMessageWithLogging,
} = vi.hoisted(() => ({
  mockGetOAuthCodeResult: vi.fn(),
  mockAcquireOAuthCodeLock: vi.fn(),
  mockSetOAuthCodeResult: vi.fn(),
  mockClearOAuthCode: vi.fn(),
  mockSyncSlackInstallation: vi.fn(),
  mockSendSlackOnboardingDirectMessageWithLogging: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-auth-secret",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    NODE_ENV: "test",
    AXIOM_TOKEN: "",
    NEXT_PUBLIC_LOG_SCOPES: "",
    ENABLE_DEBUG_LOGS: false,
    SLACK_CLIENT_ID: "slack-client-id",
    SLACK_CLIENT_SECRET: "slack-client-secret",
    WEBHOOK_URL: "",
  },
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/prisma");

vi.mock("@/utils/redis/oauth-code", () => ({
  acquireOAuthCodeLock: mockAcquireOAuthCodeLock,
  clearOAuthCode: mockClearOAuthCode,
  getOAuthCodeResult: mockGetOAuthCodeResult,
  setOAuthCodeResult: mockSetOAuthCodeResult,
}));

vi.mock("@/utils/messaging/chat-sdk/bot", () => ({
  syncSlackInstallation: mockSyncSlackInstallation,
}));

vi.mock(
  "@/utils/messaging/providers/slack/send-onboarding-direct-message",
  () => ({
    sendSlackOnboardingDirectMessageWithLogging:
      mockSendSlackOnboardingDirectMessageWithLogging,
  }),
);

import {
  SLACK_STATE_COOKIE_NAME,
  SLACK_OAUTH_STATE_TYPE,
} from "@/utils/messaging/providers/slack/constants";
import { generateSignedOAuthState } from "@/utils/oauth/state";
import { GET } from "./route";

describe("slack callback route", () => {
  const createSignedState = (emailAccountId = "email-account-123") =>
    generateSignedOAuthState({
      emailAccountId,
      type: SLACK_OAUTH_STATE_TYPE,
    });

  const createRequest = (url: string, state?: string) =>
    new NextRequest(url, {
      headers: state
        ? {
            cookie: `${SLACK_STATE_COOKIE_NAME}=${state}`,
          }
        : undefined,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();

    mockGetOAuthCodeResult.mockResolvedValue(null);
    mockAcquireOAuthCodeLock.mockResolvedValue(true);
    mockSyncSlackInstallation.mockResolvedValue(undefined);
    mockSendSlackOnboardingDirectMessageWithLogging.mockResolvedValue(
      undefined,
    );

    prisma.messagingChannel.upsert.mockResolvedValue({
      id: "channel-123",
    } as never);
    prisma.messagingChannel.updateMany.mockResolvedValue({ count: 1 } as never);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: true,
          access_token: "xoxb-access-token",
          bot_user_id: "B123",
          team: {
            id: "T123",
            name: "Acme Workspace",
          },
          authed_user: {
            id: "U123",
          },
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("redirects successful Slack connects to the account channels page", async () => {
    const state = createSignedState("account-123");

    const response = await GET(
      createRequest(
        `http://localhost:3000/api/slack/callback?code=valid-auth-code&state=${encodeURIComponent(state)}`,
        state,
      ),
    );

    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/account-123/channels");
    expect(location.searchParams.get("message")).toBe("slack_connected");
    expect(location.searchParams.get("slack_email_account_id")).toBe(
      "account-123",
    );
    expect(mockSetOAuthCodeResult).toHaveBeenCalledWith("valid-auth-code", {
      message: "slack_connected",
    });
    expect(mockSyncSlackInstallation).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "xoxb-access-token",
        botUserId: "B123",
        teamId: "T123",
        teamName: "Acme Workspace",
      }),
    );
    expect(
      mockSendSlackOnboardingDirectMessageWithLogging,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "xoxb-access-token",
        botUserId: "B123",
        teamId: "T123",
        userId: "U123",
      }),
    );
  });

  it("returns a processing redirect on the channels page while another request owns the OAuth code lock", async () => {
    const state = createSignedState("account-456");

    mockGetOAuthCodeResult
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    mockAcquireOAuthCodeLock.mockResolvedValue(false);

    const response = await GET(
      createRequest(
        `http://localhost:3000/api/slack/callback?code=valid-auth-code&state=${encodeURIComponent(state)}`,
        state,
      ),
    );

    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/account-456/channels");
    expect(location.searchParams.get("message")).toBe("processing");
    expect(location.searchParams.get("slack_email_account_id")).toBe(
      "account-456",
    );
    expect(mockAcquireOAuthCodeLock).toHaveBeenCalledWith("valid-auth-code");
    expect(mockSetOAuthCodeResult).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects a signed callback state that does not match the browser state cookie", async () => {
    const attackerState = createSignedState("attacker-account");
    const victimState = createSignedState("victim-account");

    const response = await GET(
      createRequest(
        `http://localhost:3000/api/slack/callback?code=valid-auth-code&state=${encodeURIComponent(attackerState)}`,
        victimState,
      ),
    );

    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/channels");
    expect(location.searchParams.get("error")).toBe("connection_failed");
    expect(location.searchParams.get("error_reason")).toBe("invalid_state");
    expect(mockGetOAuthCodeResult).not.toHaveBeenCalled();
    expect(mockAcquireOAuthCodeLock).not.toHaveBeenCalled();
    expect(prisma.messagingChannel.upsert).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("redirects Slack OAuth failures back to the account channels page", async () => {
    const state = createSignedState("account-789");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: async () => ({
          ok: false,
          error: "invalid_auth",
        }),
      }),
    );

    const response = await GET(
      createRequest(
        `http://localhost:3000/api/slack/callback?code=valid-auth-code&state=${encodeURIComponent(state)}`,
        state,
      ),
    );

    const location = new URL(response.headers.get("location")!);

    expect(location.pathname).toBe("/account-789/channels");
    expect(location.searchParams.get("error")).toBe("connection_failed");
    expect(location.searchParams.get("error_reason")).toBe(
      "oauth_invalid_auth",
    );
    expect(location.searchParams.get("error_detail")).toBe(
      "Slack OAuth error: invalid_auth",
    );
    expect(mockClearOAuthCode).toHaveBeenCalledWith("valid-auth-code");
  });
});
