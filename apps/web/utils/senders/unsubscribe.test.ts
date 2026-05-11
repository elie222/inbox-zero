import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";

vi.mock("@/utils/prisma");

const { dnsLookupMock, httpsRequestMock } = vi.hoisted(() => ({
  dnsLookupMock: vi.fn(),
  httpsRequestMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: dnsLookupMock,
}));

vi.mock("node:http", () => ({
  request: vi.fn(),
}));

vi.mock("node:https", () => ({
  request: httpsRequestMock,
}));

import { setSenderStatus, unsubscribeSenderAndMark } from "./unsubscribe";

describe("sender-unsubscribe", () => {
  const logger = createScopedLogger("sender-unsubscribe-test");

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.newsletter.upsert.mockResolvedValue({ id: "newsletter-1" } as any);
  });

  it("normalizes sender emails when setting status", async () => {
    await setSenderStatus({
      emailAccountId: "email-account-1",
      newsletterEmail: "Sender <sender@example.com>",
      status: NewsletterStatus.UNSUBSCRIBED,
    });

    expect(prisma.newsletter.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email_emailAccountId: {
            email: "sender@example.com",
            emailAccountId: "email-account-1",
          },
        },
      }),
    );
  });

  it("does not mark sender as unsubscribed when no unsubscribe URL is available", async () => {
    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      newsletterEmail: "sender@example.com",
      logger,
    });

    expect(httpsRequestMock).not.toHaveBeenCalled();
    expect(result.unsubscribe).toEqual({
      attempted: false,
      success: false,
      reason: "no_unsubscribe_url",
    });
    expect(result.status).toBeNull();
    expect(prisma.newsletter.upsert).not.toHaveBeenCalled();
  });

  it("treats DNS lookup failures as request failures", async () => {
    dnsLookupMock.mockRejectedValue(
      Object.assign(new Error("temporary failure"), {
        code: "EAI_AGAIN",
      }),
    );

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      newsletterEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe?id=1",
      logger,
    });

    expect(httpsRequestMock).not.toHaveBeenCalled();
    expect(result.unsubscribe).toEqual({
      attempted: true,
      success: false,
      method: "get",
      reason: "request_failed",
      statusCode: undefined,
    });
    expect(result.status).toBeNull();
    expect(prisma.newsletter.upsert).not.toHaveBeenCalled();
  });

  it("attempts one-click unsubscribe with POST when an HTTP URL is available", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    queueHttpsResponse({ statusCode: 200 });

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      newsletterEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe?id=1",
      logger,
    });

    expect(httpsRequestMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        lookup: expect.any(Function),
      }),
      expect.any(Function),
    );
    expect(result.unsubscribe).toEqual(
      expect.objectContaining({
        attempted: true,
        success: true,
        method: "post",
        statusCode: 200,
      }),
    );
    expect(prisma.newsletter.upsert).toHaveBeenCalledTimes(1);
  });

  it("allows bracketed public IPv6 unsubscribe URLs", async () => {
    queueHttpsResponse({ statusCode: 200 });

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      newsletterEmail: "sender@example.com",
      unsubscribeLink: "https://[2001:4860:4860::8888]/unsubscribe",
      logger,
    });

    expect(dnsLookupMock).not.toHaveBeenCalled();
    expect(httpsRequestMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        lookup: expect.any(Function),
      }),
      expect.any(Function),
    );
    expect(result.unsubscribe).toEqual(
      expect.objectContaining({
        attempted: true,
        success: true,
        method: "post",
        statusCode: 200,
      }),
    );
    expect(prisma.newsletter.upsert).toHaveBeenCalledTimes(1);
  });

  it("falls back to GET when POST redirects to an unsafe URL", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    queueHttpsResponse({
      statusCode: 302,
      headers: { location: "http://127.0.0.1/unsubscribe" },
    });
    queueHttpsResponse({ statusCode: 200 });

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      newsletterEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe",
      logger,
    });

    expect(httpsRequestMock).toHaveBeenCalledTimes(2);
    expect(httpsRequestMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(httpsRequestMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(result.unsubscribe).toEqual(
      expect.objectContaining({
        attempted: true,
        success: true,
        method: "get",
        statusCode: 200,
      }),
    );
    expect(prisma.newsletter.upsert).toHaveBeenCalledTimes(1);
  });
});

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
