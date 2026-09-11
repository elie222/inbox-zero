import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";

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

import {
  setSenderStatus,
  setSenderStatusWithAutoArchive,
  unsubscribeSenderAndMark,
} from "./unsubscribe";

const autoArchiveFilter = {
  id: "filter-1",
  criteria: { from: "news@example.com" },
  action: { removeLabelIds: ["INBOX"] },
};

describe("setSenderStatusWithAutoArchive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.newsletter.updateManyAndReturn.mockResolvedValue([]);
    prisma.newsletter.upsert.mockResolvedValue({ id: "newsletter-1" } as any);
  });

  async function setStatus({
    status,
    filters = [],
    labelId,
    labelName,
  }: {
    status: NewsletterStatus | null;
    filters?: unknown[];
    labelId?: string;
    labelName?: string;
  }) {
    const emailProvider = {
      name: "google" as const,
      getFiltersList: vi.fn().mockResolvedValue(filters),
      createAutoArchiveFilter: vi.fn().mockResolvedValue({ status: 200 }),
      deleteFilter: vi.fn().mockResolvedValue({ status: 200 }),
    };

    const result = await setSenderStatusWithAutoArchive({
      emailAccountId: "email-account-1",
      emailProvider: emailProvider as never,
      senderEmail: "News <News@Example.com>",
      status,
      labelId,
      labelName,
    });

    return { emailProvider, result };
  }

  it("creates the auto archive filter for the normalized sender", async () => {
    const { emailProvider, result } = await setStatus({
      status: NewsletterStatus.AUTO_ARCHIVED,
    });

    expect(emailProvider.createAutoArchiveFilter).toHaveBeenCalledWith({
      from: "news@example.com",
      gmailLabelId: undefined,
      labelName: undefined,
    });
    expect(result).toEqual({
      senderEmail: "news@example.com",
      status: NewsletterStatus.AUTO_ARCHIVED,
      autoArchived: true,
    });
  });

  it("passes the label through when archiving and labelling", async () => {
    const { emailProvider } = await setStatus({
      status: NewsletterStatus.AUTO_ARCHIVED,
      labelId: "label-1",
      labelName: "Newsletters",
    });

    expect(emailProvider.createAutoArchiveFilter).toHaveBeenCalledWith({
      from: "news@example.com",
      gmailLabelId: "label-1",
      labelName: "Newsletters",
    });
  });

  it("still applies a newly requested label when a filter already exists", async () => {
    const { emailProvider } = await setStatus({
      status: NewsletterStatus.AUTO_ARCHIVED,
      filters: [autoArchiveFilter],
      labelId: "label-1",
      labelName: "Newsletters",
    });

    expect(emailProvider.createAutoArchiveFilter).toHaveBeenCalledWith({
      from: "news@example.com",
      gmailLabelId: "label-1",
      labelName: "Newsletters",
    });
    expect(emailProvider.deleteFilter).not.toHaveBeenCalled();
  });

  it("fails rather than guessing when the filter list is unavailable", async () => {
    const emailProvider = {
      name: "google" as const,
      getFiltersList: vi.fn().mockRejectedValue(new Error("filters down")),
      createAutoArchiveFilter: vi.fn(),
      deleteFilter: vi.fn(),
    };

    await expect(
      setSenderStatusWithAutoArchive({
        emailAccountId: "email-account-1",
        emailProvider: emailProvider as never,
        senderEmail: "news@example.com",
        status: NewsletterStatus.APPROVED,
      }),
    ).rejects.toThrow("filters down");

    // Nothing was written, so the sender is not left approved but still archived.
    expect(prisma.newsletter.upsert).not.toHaveBeenCalled();
    expect(emailProvider.deleteFilter).not.toHaveBeenCalled();
  });

  it("removes the filter when the status is cleared", async () => {
    const { emailProvider, result } = await setStatus({
      status: null,
      filters: [autoArchiveFilter],
    });

    expect(emailProvider.deleteFilter).toHaveBeenCalledWith("filter-1");
    expect(result.autoArchived).toBe(false);
  });

  it("removes the filter when the sender is approved", async () => {
    const { emailProvider } = await setStatus({
      status: NewsletterStatus.APPROVED,
      filters: [autoArchiveFilter],
    });

    expect(emailProvider.deleteFilter).toHaveBeenCalledWith("filter-1");
  });

  it("removes every filter for the sender, not just the first", async () => {
    // Re-applying auto archive with a label leaves both an unlabelled and a
    // labelled rule. Missing one keeps the sender archived after approval.
    const labelledFilter = {
      id: "filter-2",
      criteria: { from: "news@example.com" },
      action: { removeLabelIds: ["INBOX"], addLabelIds: ["label-1"] },
    };

    const { emailProvider } = await setStatus({
      status: NewsletterStatus.APPROVED,
      filters: [autoArchiveFilter, labelledFilter],
    });

    expect(emailProvider.deleteFilter).toHaveBeenCalledTimes(2);
    expect(emailProvider.deleteFilter).toHaveBeenCalledWith("filter-1");
    expect(emailProvider.deleteFilter).toHaveBeenCalledWith("filter-2");
  });

  it("leaves filters for other senders alone", async () => {
    const otherSenderFilter = {
      id: "filter-other",
      criteria: { from: "other@example.com" },
      action: { removeLabelIds: ["INBOX"] },
    };

    const { emailProvider } = await setStatus({
      status: NewsletterStatus.APPROVED,
      filters: [autoArchiveFilter, otherSenderFilter],
    });

    expect(emailProvider.deleteFilter).toHaveBeenCalledTimes(1);
    expect(emailProvider.deleteFilter).toHaveBeenCalledWith("filter-1");
  });

  it("keeps the filter when the sender is unsubscribed", async () => {
    const { emailProvider, result } = await setStatus({
      status: NewsletterStatus.UNSUBSCRIBED,
      filters: [autoArchiveFilter],
    });

    expect(emailProvider.deleteFilter).not.toHaveBeenCalled();
    expect(result.autoArchived).toBe(true);
  });
});

describe("sender-unsubscribe", () => {
  const logger = createTestLogger();

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.newsletter.updateManyAndReturn.mockResolvedValue([]);
    prisma.newsletter.upsert.mockResolvedValue({ id: "newsletter-1" } as any);
  });

  it("normalizes sender emails when setting status", async () => {
    await setSenderStatus({
      emailAccountId: "email-account-1",
      senderEmail: "Sender <sender@example.com>",
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
      senderEmail: "sender@example.com",
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
      senderEmail: "sender@example.com",
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
      senderEmail: "sender@example.com",
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
      senderEmail: "sender@example.com",
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
      senderEmail: "sender@example.com",
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
