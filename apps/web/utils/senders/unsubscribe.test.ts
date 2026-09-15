import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewsletterStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: envMock,
}));
vi.mock("@/utils/senders/browser-unsubscribe", () => ({
  browserUnsubscribe: browserUnsubscribeMock,
}));
vi.mock("@/utils/ai/senders/unsubscribe-page", () => ({
  aiCheckUnsubscribePageState: checkUnsubscribePageStateMock,
}));

const {
  dnsLookupMock,
  httpsRequestMock,
  envMock,
  browserUnsubscribeMock,
  checkUnsubscribePageStateMock,
} = vi.hoisted(() => ({
  dnsLookupMock: vi.fn(),
  httpsRequestMock: vi.fn(),
  envMock: { UNSUBSCRIBE_WORKER_URL: undefined as string | undefined },
  browserUnsubscribeMock: vi.fn(),
  checkUnsubscribePageStateMock: vi.fn(),
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
    envMock.UNSUBSCRIBE_WORKER_URL = undefined;
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.newsletter.updateManyAndReturn.mockResolvedValue([]);
    prisma.newsletter.upsert.mockResolvedValue({ id: "newsletter-1" } as any);
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "email-account-1",
      userId: "user-1",
      email: "owner@example.com",
      user: { aiProvider: null, aiModel: null, aiApiKey: null },
    } as any);
    checkUnsubscribePageStateMock.mockResolvedValue("not_confirmed");
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

  it("treats a GET acknowledgment page as success after one-click POST fails", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    queueHttpsResponse({ statusCode: 404 });
    queueHttpsResponse({
      statusCode: 200,
      body: "<p>You have been unsubscribed from this list.</p>",
    });
    checkUnsubscribePageStateMock.mockResolvedValue("confirmed");

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      senderEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe",
      logger,
    });

    expect(result.unsubscribe).toEqual(
      expect.objectContaining({
        attempted: true,
        success: true,
        method: "get",
        statusCode: 200,
      }),
    );
    expect(browserUnsubscribeMock).not.toHaveBeenCalled();
  });

  it("submits a simple HTML form when one-click POST is not enough", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    queueHttpsResponse({ statusCode: 404 });
    queueHttpsResponse({
      statusCode: 200,
      body: `<form action="https://example.com/done" method="post">
        <input type="hidden" name="token" value="abc">
        <label>Email <input type="email" name="email"></label>
        <button type="submit">Unsubscribe</button>
      </form>`,
    });
    queueHttpsResponse({
      statusCode: 200,
      body: "<p>You have been unsubscribed.</p>",
    });
    checkUnsubscribePageStateMock
      .mockResolvedValueOnce("not_confirmed")
      .mockResolvedValueOnce("confirmed");

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      senderEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe",
      logger,
    });

    expect(httpsRequestMock).toHaveBeenCalledTimes(3);
    expect(httpsRequestMock.mock.calls[2]?.[1]).toEqual(
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.unsubscribe).toEqual(
      expect.objectContaining({
        attempted: true,
        success: true,
        method: "form",
        statusCode: 200,
      }),
    );
  });

  it("does not pay for classification a successful GET already decides", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    queueHttpsResponse({ statusCode: 404 });
    queueHttpsResponse({
      statusCode: 200,
      body: "<p>Thanks for visiting.</p>",
    });

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      senderEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe",
      logger,
    });

    expect(checkUnsubscribePageStateMock).not.toHaveBeenCalled();
    expect(result.unsubscribe).toEqual(
      expect.objectContaining({ success: true, method: "get" }),
    );
  });

  it("classifies a failed GET, which the fallback would otherwise reject", async () => {
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    queueHttpsResponse({ statusCode: 404 });
    queueHttpsResponse({
      statusCode: 404,
      body: "<p>You have been unsubscribed.</p>",
    });
    checkUnsubscribePageStateMock.mockResolvedValue("confirmed");

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      senderEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe",
      logger,
    });

    expect(checkUnsubscribePageStateMock).toHaveBeenCalledTimes(1);
    expect(result.unsubscribe).toEqual(
      expect.objectContaining({ success: true, method: "get" }),
    );
  });

  it("classifies a successful GET when the browser worker can take over", async () => {
    envMock.UNSUBSCRIBE_WORKER_URL = "https://worker.example.com";
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    queueHttpsResponse({ statusCode: 404 });
    queueHttpsResponse({
      statusCode: 200,
      body: "<p>You have been unsubscribed.</p>",
    });
    checkUnsubscribePageStateMock.mockResolvedValue("confirmed");

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      senderEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe",
      logger,
    });

    expect(checkUnsubscribePageStateMock).toHaveBeenCalledTimes(1);
    expect(browserUnsubscribeMock).not.toHaveBeenCalled();
    expect(result.unsubscribe).toEqual(
      expect.objectContaining({ success: true, method: "get" }),
    );
  });

  it("tries one-click POST before the browser worker", async () => {
    envMock.UNSUBSCRIBE_WORKER_URL = "https://worker.example.com";
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    queueHttpsResponse({ statusCode: 200 });

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      senderEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe?id=1",
      logger,
    });

    expect(result.unsubscribe).toEqual(
      expect.objectContaining({
        success: true,
        method: "post",
      }),
    );
    expect(browserUnsubscribeMock).not.toHaveBeenCalled();
  });

  it("uses the browser worker only after HTTP one-click and simple forms fail", async () => {
    envMock.UNSUBSCRIBE_WORKER_URL = "https://worker.example.com";
    browserUnsubscribeMock.mockResolvedValue({
      attempted: true,
      success: true,
      method: "browser",
    });
    dnsLookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    queueHttpsResponse({ statusCode: 404 });
    queueHttpsResponse({
      statusCode: 200,
      body: `<form>
        <label>Password <input type="password" name="password"></label>
        <button>Log in</button>
      </form>`,
    });

    const result = await unsubscribeSenderAndMark({
      emailAccountId: "email-account-1",
      senderEmail: "sender@example.com",
      unsubscribeLink: "https://example.com/unsubscribe",
      logger,
    });

    expect(browserUnsubscribeMock).toHaveBeenCalledTimes(1);
    expect(result.unsubscribe).toEqual(
      expect.objectContaining({
        success: true,
        method: "browser",
      }),
    );
  });
});

function queueHttpsResponse({
  statusCode,
  headers = {},
  body,
}: {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}) {
  httpsRequestMock.mockImplementationOnce(
    (
      _url: URL,
      _options: Record<string, unknown>,
      callback: (response: {
        headers: Record<string, string>;
        on: (event: string, handler: (chunk?: Buffer) => void) => void;
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
            on: vi.fn((event: string, handler: (chunk?: Buffer) => void) => {
              if (event === "data" && body) handler(Buffer.from(body));
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
