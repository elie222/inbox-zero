import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockMessage, createTestLogger } from "@/__tests__/helpers";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import prisma from "@/utils/__mocks__/prisma";
import { loadEmails } from "./stats-loading";

vi.mock("@/utils/prisma");

describe("bounded statistics loading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailMessage.findFirst.mockResolvedValue(null);
    prisma.$executeRaw.mockResolvedValue(20);
  });

  it("imports one page and reports unfinished history instead of scanning the whole mailbox", async () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      ...getMockMessage({ id: `message-${i}` }),
      internalDate: "1700000000000",
    }));
    const getMessages = vi
      .fn()
      .mockResolvedValue({ messages, nextPageToken: "next-page" });
    const result = await loadEmails(
      {
        emailAccountId: "account-1",
        emailProvider: createMockEmailProvider({
          getMessagesWithPagination: getMessages,
        }),
        logger: createTestLogger(),
      },
      { loadBefore: false },
    );

    expect(getMessages).toHaveBeenCalledOnce();
    expect(getMessages).toHaveBeenCalledWith({
      maxResults: 20,
      pageToken: undefined,
      after: undefined,
      before: undefined,
    });
    expect(result).toMatchObject({
      pages: 1,
      loadedAfterMessages: 20,
      hasMoreAfter: true,
    });
    expect(prisma.$executeRaw).toHaveBeenCalledOnce();
  });

  it("still loads older messages when a previous scan has reached the newest mail", async () => {
    const newest = new Date("2026-10-01T00:00:00Z");
    const oldest = new Date("2026-09-01T00:00:00Z");
    prisma.emailMessage.findFirst
      .mockResolvedValueOnce({ date: newest } as never)
      .mockResolvedValueOnce({ date: oldest } as never);
    const getMessages = vi
      .fn()
      .mockResolvedValueOnce({ messages: [] })
      .mockResolvedValueOnce({
        messages: [{ ...getMockMessage(), internalDate: "1700000000000" }],
      });

    const result = await loadEmails(
      {
        emailAccountId: "account-1",
        emailProvider: createMockEmailProvider({
          getMessagesWithPagination: getMessages,
        }),
        logger: createTestLogger(),
      },
      { loadBefore: true },
    );

    expect(getMessages).toHaveBeenLastCalledWith({
      maxResults: 20,
      pageToken: undefined,
      after: undefined,
      before: oldest,
    });
    expect(result).toMatchObject({
      loadedBeforeMessages: 1,
      hasMoreBefore: false,
    });
  });

  it("does not add an older page after a short nonempty page consumes the read budget", async () => {
    prisma.emailMessage.findFirst.mockResolvedValue({
      date: new Date("2026-10-01T00:00:00Z"),
    } as never);
    const getMessages = vi.fn().mockResolvedValue({
      messages: [{ ...getMockMessage(), internalDate: "1700000000000" }],
    });

    const result = await loadEmails(
      {
        emailAccountId: "account-1",
        emailProvider: createMockEmailProvider({
          getMessagesWithPagination: getMessages,
        }),
        logger: createTestLogger(),
      },
      { loadBefore: true },
    );

    expect(getMessages).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      loadedAfterMessages: 1,
      loadedBeforeMessages: 0,
      hasMoreBefore: true,
    });
  });
});
