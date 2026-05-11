import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { getResponseTimeStats } from "./controller";
import { sleep } from "@/utils/sleep";

vi.mock("@/utils/prisma");
vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

const logger = createTestLogger();

describe("getResponseTimeStats", () => {
  beforeEach(() => {
    vi.mocked(sleep).mockClear();
    vi.mocked(prisma.responseTime.createMany).mockResolvedValue({
      count: 0,
    } as never);
  });

  it("paginates sent messages when the cap is greater than one page", async () => {
    const firstPage = buildSentMessages(0, 50);
    const secondPage = buildSentMessages(50, 10);
    const allMessages = [...firstPage, ...secondPage];

    const getSentMessageIds = vi
      .fn()
      .mockResolvedValueOnce({
        messages: firstPage,
        nextPageToken: "next-page",
      })
      .mockResolvedValueOnce({
        messages: secondPage,
      });

    vi.mocked(prisma.responseTime.findMany).mockResolvedValue(
      allMessages.map((message, index) => ({
        threadId: message.threadId,
        sentMessageId: message.id,
        receivedMessageId: `received-${index}`,
        receivedAt: new Date("2026-01-01T09:00:00.000Z"),
        sentAt: new Date(
          `2026-01-01T10:${String(index).padStart(2, "0")}:00.000Z`,
        ),
        responseTimeMins: index + 1,
      })) as never,
    );

    const result = await getResponseTimeStats({
      emailAccountId: "email-account-1",
      emailProvider: {
        getSentMessageIds,
      } as never,
      logger,
      maxSentMessages: 60,
    });

    expect(getSentMessageIds).toHaveBeenCalledTimes(2);
    expect(getSentMessageIds).toHaveBeenNthCalledWith(1, {
      maxResults: 50,
      after: undefined,
      before: undefined,
      pageToken: undefined,
    });
    expect(getSentMessageIds).toHaveBeenNthCalledWith(2, {
      maxResults: 10,
      after: undefined,
      before: undefined,
      pageToken: "next-page",
    });
    expect(result.emailsAnalyzed).toBe(60);
    expect(result.maxEmailsCap).toBe(60);
  });

  it("paces paginated sent-message lookups when a delay is configured", async () => {
    const firstPage = buildSentMessages(0, 50);
    const secondPage = buildSentMessages(50, 10);
    const allMessages = [...firstPage, ...secondPage];

    const getSentMessageIds = vi
      .fn()
      .mockResolvedValueOnce({
        messages: firstPage,
        nextPageToken: "next-page",
      })
      .mockResolvedValueOnce({
        messages: secondPage,
      });

    vi.mocked(prisma.responseTime.findMany).mockResolvedValue(
      allMessages.map((message, index) => ({
        threadId: message.threadId,
        sentMessageId: message.id,
        receivedMessageId: `received-${index}`,
        receivedAt: new Date("2026-01-01T09:00:00.000Z"),
        sentAt: new Date(
          `2026-01-01T10:${String(index).padStart(2, "0")}:00.000Z`,
        ),
        responseTimeMins: index + 1,
      })) as never,
    );

    await getResponseTimeStats({
      emailAccountId: "email-account-1",
      emailProvider: {
        getSentMessageIds,
      } as never,
      logger,
      maxSentMessages: 60,
      providerRequestDelayMs: 250,
    });

    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(250);
  });
});

function buildSentMessages(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const value = start + index;

    return {
      id: `sent-${value}`,
      threadId: `thread-${value}`,
    };
  });
}
