import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  ensureSlackTeamInstallationMock,
  extractSlackTeamIdFromWebhookMock,
  slackWebhookMock,
  withMessagingRequestLoggerMock,
  validateSlackWebhookRequestMock,
  publishAppHomeMock,
  handleSlackAppUninstalledMock,
} = vi.hoisted(() => ({
  validateSlackWebhookRequestMock: vi.fn(),
  ensureSlackTeamInstallationMock: vi.fn(),
  extractSlackTeamIdFromWebhookMock: vi.fn(),
  slackWebhookMock: vi.fn(),
  withMessagingRequestLoggerMock: vi.fn(
    ({ fn }: { fn: () => Promise<Response> }) => fn(),
  ),
  publishAppHomeMock: vi.fn(),
  handleSlackAppUninstalledMock: vi.fn(),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/env", () => ({
  env: {
    SLACK_SIGNING_SECRET: "test-signing-secret",
  },
}));

vi.mock("@/utils/messaging/providers/slack/verify-signature", () => ({
  validateSlackWebhookRequest: (...args: unknown[]) =>
    validateSlackWebhookRequestMock(...args),
}));

vi.mock("@/utils/messaging/providers/slack/app-home", () => ({
  publishAppHome: (...args: unknown[]) => publishAppHomeMock(...args),
}));

vi.mock("@/utils/messaging/providers/slack/uninstall", () => ({
  handleSlackAppUninstalled: (...args: unknown[]) =>
    handleSlackAppUninstalledMock(...args),
}));

vi.mock("@/utils/messaging/chat-sdk/bot", () => ({
  ensureSlackTeamInstallation: (...args: unknown[]) =>
    ensureSlackTeamInstallationMock(...args),
  extractSlackTeamIdFromWebhook: (...args: unknown[]) =>
    extractSlackTeamIdFromWebhookMock(...args),
  getMessagingChatSdkBot: () => ({
    bot: {
      webhooks: {
        slack: (...args: unknown[]) => slackWebhookMock(...args),
      },
    },
  }),
  withMessagingRequestLogger: (args: {
    logger: unknown;
    fn: () => Promise<Response>;
  }) => withMessagingRequestLoggerMock(args),
}));

import { POST } from "./route";

function createRequest({
  body = '{"type":"event_callback"}',
  signature = "v0=test",
  timestamp = `${Math.floor(Date.now() / 1000)}`,
}: {
  body?: string;
  signature?: string;
  timestamp?: string;
}) {
  return new Request("https://example.com/api/slack/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-slack-signature": signature,
      "x-slack-request-timestamp": timestamp,
    },
    body,
  });
}

const context = { params: Promise.resolve({}) } as {
  params: Promise<Record<string, string>>;
};

describe("Slack events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    validateSlackWebhookRequestMock.mockReturnValue({ valid: true });
    extractSlackTeamIdFromWebhookMock.mockReturnValue("T-TEAM");
    ensureSlackTeamInstallationMock.mockResolvedValue(undefined);
    slackWebhookMock.mockResolvedValue(NextResponse.json({ ok: true }));
  });

  it("rejects stale requests before seeding installation", async () => {
    validateSlackWebhookRequestMock.mockReturnValueOnce({
      valid: false,
      reason: "stale_timestamp",
    });
    const request = createRequest({ timestamp: "1" });

    const response = await POST(request as any, context);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Request too old" });
    expect(validateSlackWebhookRequestMock).toHaveBeenCalledTimes(1);
    expect(ensureSlackTeamInstallationMock).not.toHaveBeenCalled();
    expect(slackWebhookMock).not.toHaveBeenCalled();
  });

  it("rejects invalid signature before seeding installation", async () => {
    validateSlackWebhookRequestMock.mockReturnValueOnce({
      valid: false,
      reason: "invalid_signature",
    });
    const request = createRequest({});

    const response = await POST(request as any, context);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Invalid signature" });
    expect(validateSlackWebhookRequestMock).toHaveBeenCalledTimes(1);
    expect(ensureSlackTeamInstallationMock).not.toHaveBeenCalled();
    expect(slackWebhookMock).not.toHaveBeenCalled();
  });

  it("continues webhook handling when installation seeding fails", async () => {
    ensureSlackTeamInstallationMock.mockRejectedValueOnce(
      new Error("seeding failed"),
    );
    const request = createRequest({});

    const response = await POST(request as any, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(validateSlackWebhookRequestMock).toHaveBeenCalledTimes(1);
    expect(ensureSlackTeamInstallationMock).toHaveBeenCalledWith(
      "T-TEAM",
      expect.anything(),
    );
    expect(withMessagingRequestLoggerMock).toHaveBeenCalledTimes(1);
    expect(withMessagingRequestLoggerMock).toHaveBeenCalledWith({
      logger: expect.anything(),
      fn: expect.any(Function),
    });
    expect(slackWebhookMock).toHaveBeenCalledTimes(1);
  });

  it("intercepts app_home_opened and calls publishAppHome", async () => {
    publishAppHomeMock.mockResolvedValue(true);
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T-TEAM",
      event: { type: "app_home_opened", user: "U-USER", tab: "home" },
    });
    const request = createRequest({ body });

    const response = await POST(request as any, context);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(publishAppHomeMock).toHaveBeenCalledWith({
      teamId: "T-TEAM",
      userId: "U-USER",
      logger: expect.anything(),
    });
    expect(slackWebhookMock).not.toHaveBeenCalled();
  });

  it("skips publishAppHome for app_home_opened on messages tab", async () => {
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T-TEAM",
      event: { type: "app_home_opened", user: "U-USER", tab: "messages" },
    });
    const request = createRequest({ body });

    const response = await POST(request as any, context);

    expect(response.status).toBe(200);
    expect(publishAppHomeMock).not.toHaveBeenCalled();
    expect(slackWebhookMock).toHaveBeenCalledTimes(1);
  });

  it("intercepts app_uninstalled and calls handleSlackAppUninstalled", async () => {
    handleSlackAppUninstalledMock.mockResolvedValue(undefined);
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T-TEAM",
      event: { type: "app_uninstalled" },
    });
    const request = createRequest({ body });

    const response = await POST(request as any, context);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(handleSlackAppUninstalledMock).toHaveBeenCalledWith({
      teamId: "T-TEAM",
      logger: expect.anything(),
    });
    expect(slackWebhookMock).not.toHaveBeenCalled();
  });

  it("intercepts tokens_revoked and calls handleSlackAppUninstalled", async () => {
    handleSlackAppUninstalledMock.mockResolvedValue(undefined);
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T-TEAM",
      event: { type: "tokens_revoked" },
    });
    const request = createRequest({ body });

    const response = await POST(request as any, context);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(handleSlackAppUninstalledMock).toHaveBeenCalledWith({
      teamId: "T-TEAM",
      logger: expect.anything(),
    });
    expect(slackWebhookMock).not.toHaveBeenCalled();
  });

  it("forwards non-intercepted events to Chat SDK bot", async () => {
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T-TEAM",
      event: { type: "message", user: "U-USER", text: "hello" },
    });
    const request = createRequest({ body });

    const response = await POST(request as any, context);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(publishAppHomeMock).not.toHaveBeenCalled();
    expect(handleSlackAppUninstalledMock).not.toHaveBeenCalled();
    expect(slackWebhookMock).toHaveBeenCalledTimes(1);
  });

  it("handles publishAppHome failure gracefully", async () => {
    publishAppHomeMock.mockRejectedValue(new Error("DB down"));
    const body = JSON.stringify({
      type: "event_callback",
      team_id: "T-TEAM",
      event: { type: "app_home_opened", user: "U-USER", tab: "home" },
    });
    const request = createRequest({ body });

    const response = await POST(request as any, context);

    expect(response.status).toBe(200);
    expect(publishAppHomeMock).toHaveBeenCalledTimes(1);
  });
});
