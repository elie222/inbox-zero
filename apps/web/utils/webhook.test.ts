import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

const { dnsLookupMock, httpsRequestMock, validateWebhookUrlMock } = vi.hoisted(
  () => ({
    dnsLookupMock: vi.fn(),
    httpsRequestMock: vi.fn(),
    validateWebhookUrlMock: vi.fn(),
  }),
);

vi.mock("node:dns/promises", () => ({
  lookup: dnsLookupMock,
}));

vi.mock("node:http", () => ({
  request: vi.fn(),
}));

vi.mock("node:https", () => ({
  request: httpsRequestMock,
}));

vi.mock("@/utils/webhook-validation", () => ({
  validateWebhookUrl: (...args: unknown[]) => validateWebhookUrlMock(...args),
}));

import { callWebhook } from "./webhook";

describe("callWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validateWebhookUrlMock.mockResolvedValue({ valid: true });
    prisma.user.findUnique.mockResolvedValue({
      webhookSecret: "webhook-secret",
    } as any);
  });

  it("sends the webhook using a pinned DNS lookup", async () => {
    dnsLookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as Awaited<ReturnType<typeof dnsLookupMock>>);
    queueHttpsResponse({ statusCode: 204 });

    await expect(
      callWebhook("user-1", "https://example.com/webhook", getPayload()),
    ).resolves.toBeUndefined();

    expect(validateWebhookUrlMock).toHaveBeenCalledWith(
      "https://example.com/webhook",
    );
    expect(httpsRequestMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        lookup: expect.any(Function),
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Webhook-Secret": "webhook-secret",
        }),
      }),
      expect.any(Function),
    );
  });

  it("skips the request when DNS revalidation resolves to an unsafe address", async () => {
    dnsLookupMock.mockResolvedValue([
      { address: "10.0.0.8", family: 4 },
    ] as Awaited<ReturnType<typeof dnsLookupMock>>);

    await expect(
      callWebhook("user-1", "https://example.com/webhook", getPayload()),
    ).resolves.toBeUndefined();

    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("does not follow redirects and treats them as rejected responses", async () => {
    dnsLookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ] as Awaited<ReturnType<typeof dnsLookupMock>>);
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
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
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
