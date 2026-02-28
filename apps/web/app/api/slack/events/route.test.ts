import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const {
  ensureSlackTeamInstallationMock,
  extractSlackTeamIdFromWebhookMock,
  slackWebhookMock,
  verifySlackSignatureMock,
} = vi.hoisted(() => ({
  verifySlackSignatureMock: vi.fn(),
  ensureSlackTeamInstallationMock: vi.fn(),
  extractSlackTeamIdFromWebhookMock: vi.fn(),
  slackWebhookMock: vi.fn(),
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
  env: {
    SLACK_SIGNING_SECRET: "test-signing-secret",
  },
}));

vi.mock("@inboxzero/slack", () => ({
  verifySlackSignature: (...args: unknown[]) =>
    verifySlackSignatureMock(...args),
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
  const request = new Request("https://example.com/api/slack/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-slack-signature": signature,
      "x-slack-request-timestamp": timestamp,
    },
    body,
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

describe("Slack events route", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    verifySlackSignatureMock.mockReturnValue(true);
    extractSlackTeamIdFromWebhookMock.mockReturnValue("T-TEAM");
    ensureSlackTeamInstallationMock.mockResolvedValue(undefined);
    slackWebhookMock.mockResolvedValue(NextResponse.json({ ok: true }));
  });

  it("rejects stale requests before seeding installation", async () => {
    const request = createRequest({ timestamp: "1" });

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Request too old" });
    expect(verifySlackSignatureMock).not.toHaveBeenCalled();
    expect(ensureSlackTeamInstallationMock).not.toHaveBeenCalled();
    expect(slackWebhookMock).not.toHaveBeenCalled();
  });

  it("rejects invalid signature before seeding installation", async () => {
    verifySlackSignatureMock.mockReturnValue(false);
    const request = createRequest({});

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Invalid signature" });
    expect(verifySlackSignatureMock).toHaveBeenCalledTimes(1);
    expect(ensureSlackTeamInstallationMock).not.toHaveBeenCalled();
    expect(slackWebhookMock).not.toHaveBeenCalled();
  });

  it("continues webhook handling when installation seeding fails", async () => {
    ensureSlackTeamInstallationMock.mockRejectedValueOnce(
      new Error("seeding failed"),
    );
    const request = createRequest({});

    const response = await POST(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(verifySlackSignatureMock).toHaveBeenCalledTimes(1);
    expect(ensureSlackTeamInstallationMock).toHaveBeenCalledWith(
      "T-TEAM",
      request.logger,
    );
    expect(slackWebhookMock).toHaveBeenCalledTimes(1);
    expect(request.logger.warn).toHaveBeenCalledWith(
      "Failed to seed Slack installation for Chat SDK",
      expect.objectContaining({ teamId: "T-TEAM" }),
    );
  });
});
