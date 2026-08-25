// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { prefetchThreadDetail } from "./thread-prefetch";

const threadCache = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
}));
const emailHtml = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

vi.mock("@/utils/email-cache/threads", () => ({
  readCachedThreadDetail: threadCache.read,
  writeCachedThreadDetail: threadCache.write,
}));

vi.mock("@/utils/email/prepare-html.client", () => ({
  prepareEmailHtml: emailHtml.prepare,
}));

describe("prefetchThreadDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    threadCache.write.mockResolvedValue(undefined);
    emailHtml.prepare.mockResolvedValue(undefined);
  });

  it("hydrates SWR from disk and prepares the latest visible html without a request", async () => {
    threadCache.read.mockResolvedValue({
      data: {
        thread: {
          id: "thread-1",
          messages: [
            {
              id: "thread-1-older",
              labelIds: [],
              textHtml: "<p>older</p>",
            },
            {
              id: "thread-1-draft",
              labelIds: ["DRAFT"],
              textHtml: "<p>draft</p>",
            },
            {
              id: "thread-1-latest",
              labelIds: [],
              textHtml: "<p>latest</p>",
            },
          ],
        },
      },
    });
    const fetcher = vi.fn();
    const mutate = vi.fn().mockResolvedValue(undefined);

    await prefetchThreadDetail({
      emailAccountId: "account-1",
      threadId: "thread-1",
      fetcher,
      mutate,
    });

    expect(fetcher).not.toHaveBeenCalled();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(threadCache.write).not.toHaveBeenCalled();
    expect(emailHtml.prepare).toHaveBeenCalledWith({
      html: "<p>latest</p>",
      messageId: "thread-1-latest",
    });
  });

  it("writes fetched thread details and prepares visible html", async () => {
    threadCache.read.mockResolvedValue(undefined);
    const fetcher = vi.fn().mockResolvedValue({
      thread: {
        id: "thread-2",
        messages: [
          {
            id: "thread-2-message",
            labelIds: [],
            textHtml: "<p>network</p>",
          },
        ],
      },
    });
    const mutate = vi.fn().mockResolvedValue(undefined);

    await prefetchThreadDetail({
      emailAccountId: "account-2",
      threadId: "thread-2",
      fetcher,
      mutate,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(threadCache.write).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          thread: expect.objectContaining({ id: "thread-2" }),
        }),
        emailAccountId: "account-2",
        threadId: "thread-2",
      }),
    );
    expect(emailHtml.prepare).toHaveBeenCalledWith({
      html: "<p>network</p>",
      messageId: "thread-2-message",
    });
  });

  it("skips html preparation when cancellation happens after hydrating from disk", async () => {
    let cancelled = false;
    threadCache.read.mockResolvedValue({
      data: {
        thread: {
          id: "thread-3",
          messages: [
            {
              id: "thread-3-message",
              labelIds: [],
              textHtml: "<p>x</p>",
            },
          ],
        },
      },
    });
    const mutate = vi.fn().mockImplementation(async () => {
      cancelled = true;
    });

    await prefetchThreadDetail({
      emailAccountId: "account-3",
      threadId: "thread-3",
      fetcher: vi.fn(),
      isCancelled: () => cancelled,
      mutate,
    });

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(emailHtml.prepare).not.toHaveBeenCalled();
  });

  it("skips mutate and persistence when the scope goes stale before the network returns", async () => {
    threadCache.read.mockResolvedValue(undefined);
    let cancelled = false;
    const response = Promise.withResolvers<unknown>();
    const fetcher = vi.fn(() => response.promise);
    const mutate = vi.fn().mockResolvedValue(undefined);

    const prefetch = prefetchThreadDetail({
      emailAccountId: "account-4",
      threadId: "thread-4",
      fetcher,
      isCancelled: () => cancelled,
      mutate,
    });

    cancelled = true;
    response.resolve({
      thread: {
        id: "thread-4",
        messages: [
          {
            id: "thread-4-message",
            labelIds: [],
            textHtml: "<p>late</p>",
          },
        ],
      },
    });
    await prefetch;

    expect(mutate).not.toHaveBeenCalled();
    expect(threadCache.write).not.toHaveBeenCalled();
    expect(emailHtml.prepare).not.toHaveBeenCalled();
  });
});
