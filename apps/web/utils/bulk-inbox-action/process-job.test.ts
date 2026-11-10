import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { getEmailAccount, getMockMessage } from "@/__tests__/helpers";
import { aiFilterEmailsForBulkAction } from "@/utils/ai/bulk-inbox-action/filter-emails";
import { createEmailProvider } from "@/utils/email/provider";
import { ProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";
import type { ParsedMessage } from "@/utils/types";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { processBulkInboxActionJobChunk } from "./process-job";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/user/get", () => ({ getEmailAccountWithAi: vi.fn() }));
vi.mock("@/utils/ai/bulk-inbox-action/filter-emails", () => ({
  aiFilterEmailsForBulkAction: vi.fn(),
}));
vi.mock("@/utils/sleep", () => ({ sleep: vi.fn() }));

const logger = createScopedLogger("bulk-inbox-action-test");
const CHUNK_TOKEN = "token-1";

describe("processBulkInboxActionJobChunk", () => {
  let job: Record<string, any>;
  let mailbox: ReturnType<typeof createMailbox>;

  beforeEach(() => {
    vi.clearAllMocks();
    job = createJob();
    mockJobStore(() => job);
    vi.mocked(getEmailAccountWithAi).mockResolvedValue({
      ...getEmailAccount(),
      name: null,
    });
  });

  it("acts on every match across pages while archiving shifts later matches forward", async () => {
    mailbox = createMailbox(120);
    useMailbox(mailbox);

    const outcome = await runChunk();

    expect(outcome.status).toBe("completed");
    expect(mailbox.inboxThreadIds()).toEqual([]);
    expect(job).toMatchObject({
      status: "COMPLETED",
      processedCount: 120,
      matchedCount: 120,
      actedCount: 120,
      skippedCount: 0,
      failedCount: 0,
    });
  });

  it("only acts on emails the instruction filter keeps and still finishes", async () => {
    mailbox = createMailbox(130, (index) =>
      index % 3 === 0 ? "news@letter.com" : "friend@example.com",
    );
    useMailbox(mailbox);
    job.instruction = "newsletters";
    vi.mocked(aiFilterEmailsForBulkAction).mockImplementation(
      async ({ messages }) =>
        new Set(
          messages
            .filter((message) => message.headers.from === "news@letter.com")
            .map((message) => message.id),
        ),
    );

    const outcome = await runChunk();

    expect(outcome.status).toBe("completed");
    const remaining = mailbox.inboxThreadIds();
    expect(remaining).toHaveLength(86);
    expect(
      remaining.every((threadId) => Number(threadId.slice(1)) % 3 !== 0),
    ).toBe(true);
    expect(job).toMatchObject({
      processedCount: 130,
      matchedCount: 44,
      actedCount: 44,
      skippedCount: 86,
      failedCount: 0,
    });
  });

  it("counts failed threads once and leaves them in place", async () => {
    mailbox = createMailbox(60);
    useMailbox(mailbox, {
      archiveThread: async (threadId) => {
        if (threadId === "t5" || threadId === "t55") {
          throw new Error("Thread is locked");
        }
        mailbox.archive(threadId);
      },
    });

    const outcome = await runChunk();

    expect(outcome.status).toBe("completed");
    expect(mailbox.inboxThreadIds()).toEqual(["t5", "t55"]);
    expect(job).toMatchObject({
      processedCount: 60,
      actedCount: 58,
      failedCount: 2,
    });
  });

  it("leaves a batch untouched when the filter fails", async () => {
    mailbox = createMailbox(10);
    useMailbox(mailbox);
    job.instruction = "newsletters";
    vi.mocked(aiFilterEmailsForBulkAction).mockRejectedValue(
      new Error("model unavailable"),
    );

    const outcome = await runChunk();

    expect(outcome.status).toBe("completed");
    expect(mailbox.inboxThreadIds()).toHaveLength(10);
    expect(job).toMatchObject({ processedCount: 10, failedCount: 10 });
  });

  it("waits out a provider rate limit and retries the threads it skipped", async () => {
    mailbox = createMailbox(20);
    let rateLimited = false;
    useMailbox(mailbox, {
      archiveThread: async (threadId) => {
        if (threadId === "t3" && !rateLimited) {
          rateLimited = true;
          throw new ProviderRateLimitModeError({
            provider: "google",
            retryAt: new Date(Date.now() + 10_000),
          });
        }
        mailbox.archive(threadId);
      },
    });

    const outcome = await runChunk();

    expect(outcome.status).toBe("completed");
    expect(sleep).toHaveBeenCalled();
    expect(mailbox.inboxThreadIds()).toEqual([]);
    expect(job).toMatchObject({ actedCount: 20, failedCount: 0 });
  });

  it("hands off to a new chunk when the time budget runs out", async () => {
    mailbox = createMailbox(10);
    useMailbox(mailbox);

    const outcome = await runChunk({ budgetMs: 0 });

    expect(outcome.status).toBe("continue");
    if (outcome.status !== "continue") return;
    expect(job.chunkToken).toBe(outcome.nextChunkToken);
    expect(job.leaseExpiresAt).toBeNull();
    expect(mailbox.inboxThreadIds()).toHaveLength(10);
  });

  it("ignores a delivery whose chunk token was already used", async () => {
    mailbox = createMailbox(10);
    useMailbox(mailbox);
    job.chunkToken = "newer-token";

    const outcome = await runChunk();

    expect(outcome.status).toBe("stale");
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("stops when the user cancels the job", async () => {
    mailbox = createMailbox(10);
    useMailbox(mailbox);
    job.status = "CANCELLED";

    const outcome = await runChunk();

    expect(outcome.status).toBe("stale");
    expect(mailbox.inboxThreadIds()).toHaveLength(10);
  });

  async function runChunk({ budgetMs }: { budgetMs?: number } = {}) {
    return processBulkInboxActionJobChunk({
      jobId: job.id,
      chunkToken: CHUNK_TOKEN,
      logger,
      budgetMs,
    });
  }
});

function createJob() {
  return {
    id: "job-1",
    status: "RUNNING",
    emailAccountId: "email-account-id",
    search: { query: "in:inbox" },
    action: "archive_threads",
    labelId: null,
    labelName: null,
    instruction: null as string | null,
    pageToken: null,
    pageSeenThreadIds: [] as string[],
    rateLimitedUntil: null,
    leaseExpiresAt: null as Date | null,
    chunkToken: CHUNK_TOKEN,
    processedCount: 0,
    matchedCount: 0,
    actedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    error: null,
    completedAt: null,
  };
}

// A single in-memory job row, enough for the updateMany guards the job uses.
function mockJobStore(getJob: () => Record<string, any>) {
  const matches = (where: Record<string, any>) => {
    const job = getJob();
    if (where.id && where.id !== job.id) return false;
    if (where.status && where.status !== job.status) return false;
    if (where.chunkToken && where.chunkToken !== job.chunkToken) return false;
    if (where.OR) {
      const leaseFree =
        !job.leaseExpiresAt || job.leaseExpiresAt.getTime() < Date.now();
      if (!leaseFree) return false;
    }
    return true;
  };
  const apply = (data: Record<string, any>) => {
    const job = getJob();
    for (const [key, value] of Object.entries(data)) {
      job[key] =
        value && typeof value === "object" && "increment" in value
          ? job[key] + value.increment
          : value;
    }
  };

  prisma.bulkInboxActionJob.updateMany.mockImplementation((async ({
    where,
    data,
  }: any) => {
    if (!matches(where)) return { count: 0 };
    apply(data);
    return { count: 1 };
  }) as any);
  prisma.bulkInboxActionJob.update.mockImplementation((async ({
    data,
  }: any) => {
    apply(data);
    return getJob();
  }) as any);
  prisma.bulkInboxActionJob.findUnique.mockImplementation((async () => ({
    ...getJob(),
  })) as any);
}

function createMailbox(
  threadCount: number,
  getFrom: (index: number) => string = () => "sender@example.com",
) {
  const threads = Array.from({ length: threadCount }, (_, index) => ({
    message: getMockMessage({
      id: `m${index}`,
      threadId: `t${index}`,
      from: getFrom(index),
      subject: `Email ${index}`,
      labelIds: ["INBOX"],
    }) as ParsedMessage,
    inInbox: true,
  }));

  return {
    // Offset page tokens, like provider pagination: removing earlier results
    // shifts later ones into the current page.
    search: async ({
      maxResults = 20,
      pageToken,
    }: {
      maxResults?: number;
      pageToken?: string;
    }) => {
      const inbox = threads.filter((thread) => thread.inInbox);
      const offset = pageToken ? Number(pageToken) : 0;
      const page = inbox.slice(offset, offset + maxResults);
      const nextOffset = offset + maxResults;
      return {
        messages: page.map((thread) => thread.message),
        nextPageToken:
          nextOffset < inbox.length ? String(nextOffset) : undefined,
      };
    },
    archive: (threadId: string) => {
      const thread = threads.find(
        (candidate) => candidate.message.threadId === threadId,
      );
      if (thread) thread.inInbox = false;
    },
    inboxThreadIds: () =>
      threads
        .filter((thread) => thread.inInbox)
        .map((thread) => thread.message.threadId),
  };
}

function useMailbox(
  mailbox: ReturnType<typeof createMailbox>,
  {
    archiveThread,
  }: { archiveThread?: (threadId: string) => Promise<void> } = {},
) {
  vi.mocked(createEmailProvider).mockResolvedValue(
    createMockEmailProvider({
      searchMessages: vi.fn(mailbox.search),
      archiveThread: vi.fn(
        archiveThread ?? (async (threadId) => mailbox.archive(threadId)),
      ),
    }),
  );
}
