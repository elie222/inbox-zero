import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import {
  enqueueBulkArchiveSenderJobs,
  MAIL_BULK_ARCHIVE_PATH,
  MAIL_BULK_ARCHIVE_QUEUE_NAME,
  MAIL_BULK_ARCHIVE_TOPIC,
} from "./bulk-archive-queue";

vi.mock("server-only", () => ({}));

const mockEnqueueBackgroundJob = vi.fn();

vi.mock("@/utils/queue/dispatch", () => ({
  enqueueBackgroundJob: (
    ...args: Parameters<typeof mockEnqueueBackgroundJob>
  ) => mockEnqueueBackgroundJob(...args),
}));

describe("enqueueBulkArchiveSenderJobs", () => {
  beforeEach(() => {
    mockEnqueueBackgroundJob.mockReset();
    mockEnqueueBackgroundJob.mockResolvedValue("bullmq");
  });

  it("queues one background job per unique sender", async () => {
    const logger = createScopedLogger("bulk-archive-queue-test");

    const queuedSenders = await enqueueBulkArchiveSenderJobs({
      emailAccountId: "account-1",
      ownerEmail: "owner@example.com",
      froms: [
        " sender@example.com ",
        "sender@example.com",
        "other@example.com",
        "",
      ],
      logger,
    });

    expect(queuedSenders).toBe(2);
    expect(mockEnqueueBackgroundJob).toHaveBeenCalledTimes(2);
    expect(mockEnqueueBackgroundJob).toHaveBeenNthCalledWith(1, {
      topic: MAIL_BULK_ARCHIVE_TOPIC,
      body: {
        emailAccountId: "account-1",
        ownerEmail: "owner@example.com",
        provider: "google",
        sender: "sender@example.com",
      },
      qstash: {
        queueName: MAIL_BULK_ARCHIVE_QUEUE_NAME,
        parallelism: 1,
        path: MAIL_BULK_ARCHIVE_PATH,
      },
      logger,
    });
    expect(mockEnqueueBackgroundJob).toHaveBeenNthCalledWith(2, {
      topic: MAIL_BULK_ARCHIVE_TOPIC,
      body: {
        emailAccountId: "account-1",
        ownerEmail: "owner@example.com",
        provider: "google",
        sender: "other@example.com",
      },
      qstash: {
        queueName: MAIL_BULK_ARCHIVE_QUEUE_NAME,
        parallelism: 1,
        path: MAIL_BULK_ARCHIVE_PATH,
      },
      logger,
    });
  });
});
