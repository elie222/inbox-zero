import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { callWebhook } from "./webhook";

vi.mock("@/utils/prisma");

const {
  mockEnv,
  httpsRequestMock,
  resolveSafeExternalHttpUrlMock,
  validateWebhookUrlMock,
} = vi.hoisted(() => ({
  mockEnv: {
    webhookActionsEnabled: true,
  },
  httpsRequestMock: vi.fn(),
  resolveSafeExternalHttpUrlMock: vi.fn(),
  validateWebhookUrlMock: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED() {
      return mockEnv.webhookActionsEnabled;
    },
  },
}));

vi.mock("node:https", () => ({
  request: httpsRequestMock,
}));

vi.mock("@/utils/network/safe-http-url", () => ({
  resolveSafeExternalHttpUrl: (...args: unknown[]) =>
    resolveSafeExternalHttpUrlMock(...args),
}));

vi.mock("@/utils/webhook-validation", () => ({
  validateWebhookUrl: (...args: unknown[]) => validateWebhookUrlMock(...args),
}));

describe("callWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.webhookActionsEnabled = true;
    validateWebhookUrlMock.mockResolvedValue({ valid: true });
    prisma.user.findUnique.mockResolvedValue({
      webhookSecret: "webhook-secret",
    } as never);
    resolveSafeExternalHttpUrlMock.mockResolvedValue({
      url: new URL("https://example.com/webhook"),
      lookup: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips existing webhook actions when webhook actions are disabled", async () => {
    mockEnv.webhookActionsEnabled = false;

    await expect(
      callWebhook("user-1", "https://example.com/webhook", getPayload()),
    ).resolves.toBeUndefined();

    expect(validateWebhookUrlMock).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(resolveSafeExternalHttpUrlMock).not.toHaveBeenCalled();
    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("sends the webhook using the resolved safe URL", async () => {
    const lookup = vi.fn();
    resolveSafeExternalHttpUrlMock.mockResolvedValue({
      url: new URL("https://example.com/webhook"),
      lookup,
    });
    queueHttpsResponse({ statusCode: 204 });

    await expect(
      callWebhook("user-1", "https://example.com/webhook", getPayload()),
    ).resolves.toBeUndefined();

    expect(validateWebhookUrlMock).toHaveBeenCalledWith(
      "https://example.com/webhook",
    );
    expect(resolveSafeExternalHttpUrlMock).toHaveBeenCalledWith(
      "https://example.com/webhook",
    );
    expect(httpsRequestMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        lookup,
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Webhook-Secret": "webhook-secret",
        }),
      }),
      expect.any(Function),
    );
  });

  it("skips the request when safe URL resolution fails", async () => {
    resolveSafeExternalHttpUrlMock.mockResolvedValue(null);

    await expect(
      callWebhook("user-1", "https://example.com/webhook", getPayload()),
    ).resolves.toBeUndefined();

    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("does not follow redirects and treats them as rejected responses", async () => {
    queueHttpsResponse({
      statusCode: 302,
      headers: { location: "https://redirected.example.com/webhook" },
    });

    await expect(
      callWebhook("user-1", "https://example.com/webhook", getPayload()),
    ).resolves.toBeUndefined();

    expect(httpsRequestMock).toHaveBeenCalledTimes(1);
  });
});

function getPayload() {
  return {
    email: {
      threadId: "thread-1",
      messageId: "message-1",
      subject: "Subject",
      from: "sender@example.com",
      headerMessageId: "<message-1@example.com>",
    },
    executedRule: {
      id: "executed-rule-1",
      ruleId: "rule-1",
      reason: "matched",
      automated: true,
      createdAt: new Date("2026-04-01T10:00:00.000Z"),
    },
  };
}

function queueHttpsResponse({
  statusCode,
  headers = {},
}: {
  statusCode: number;
  headers?: Record<string, string>;
}) {
  httpsRequestMock.mockImplementationOnce(
    (
      _url: URL,
      _options: Record<string, unknown>,
      callback: (response: {
        headers: Record<string, string>;
        on: (event: string, handler: () => void) => void;
        resume: () => void;
        statusCode: number;
      }) => void,
    ) => {
      let errorHandler: ((error: Error) => void) | undefined;

      const request = {
        destroy: vi.fn((error?: Error) => {
          if (error) errorHandler?.(error);
        }),
        end: vi.fn(() => {
          const response = {
            headers,
            on: vi.fn((event: string, handler: () => void) => {
              if (event === "end") handler();
            }),
            resume: vi.fn(),
            statusCode,
          };

          callback(response);
        }),
        on: vi.fn((event: string, handler: (error: Error) => void) => {
          if (event === "error") errorHandler = handler;
          return request;
        }),
        setTimeout: vi.fn(),
        write: vi.fn(),
      };

      return request;
    },
  );
}
