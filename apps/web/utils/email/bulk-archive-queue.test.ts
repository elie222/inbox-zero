import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import {
  executeBulkArchiveSenderJob,
  enqueueBulkArchiveSenderJobs,
  MAIL_BULK_ARCHIVE_PATH,
  MAIL_BULK_ARCHIVE_QUEUE_NAME,
  MAIL_BULK_ARCHIVE_TOPIC,
} from "./bulk-archive-queue";

vi.mock("server-only", () => ({}));

const mockEnqueueBackgroundJob = vi.fn();
const mockCreateEmailProvider = vi.fn();
const mockBulkArchiveFromSenders = vi.fn();
const mockBulkArchiveSenderOrThrow = vi.fn();
const mockSaveBulkArchiveTotalItems = vi.fn();
const mockSaveBulkArchiveProgress = vi.fn();
const mockSaveQueuedBulkArchiveSenderStatuses = vi.fn();
const mockSaveCompletedBulkArchiveSenderStatus = vi.fn();

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: (...args: Parameters<typeof mockCreateEmailProvider>) =>
    mockCreateEmailProvider(...args),
}));

vi.mock("@/utils/email/google", () => ({
  GmailProvider: class MockGmailProvider {
    bulkArchiveFromSenders = mockBulkArchiveFromSenders;
    bulkArchiveSenderOrThrow = mockBulkArchiveSenderOrThrow;
  },
}));

vi.mock("@/utils/email/microsoft", () => ({
  OutlookProvider: class MockOutlookProvider {
    bulkArchiveFromSenders = mockBulkArchiveFromSenders;
    bulkArchiveSenderOrThrow = mockBulkArchiveSenderOrThrow;
  },
}));

vi.mock("@/utils/queue/dispatch", () => ({
  enqueueBackgroundJob: (
    ...args: Parameters<typeof mockEnqueueBackgroundJob>
  ) => mockEnqueueBackgroundJob(...args),
}));

vi.mock("@/utils/redis/bulk-archive-progress", () => ({
  saveBulkArchiveTotalItems: (
    ...args: Parameters<typeof mockSaveBulkArchiveTotalItems>
  ) => mockSaveBulkArchiveTotalItems(...args),
  saveBulkArchiveProgress: (
    ...args: Parameters<typeof mockSaveBulkArchiveProgress>
  ) => mockSaveBulkArchiveProgress(...args),
}));

vi.mock("@/utils/redis/bulk-archive-sender-status", () => ({
  saveQueuedBulkArchiveSenderStatuses: (
    ...args: Parameters<typeof mockSaveQueuedBulkArchiveSenderStatuses>
  ) => mockSaveQueuedBulkArchiveSenderStatuses(...args),
  saveCompletedBulkArchiveSenderStatus: (
    ...args: Parameters<typeof mockSaveCompletedBulkArchiveSenderStatus>
  ) => mockSaveCompletedBulkArchiveSenderStatus(...args),
}));

describe("enqueueBulkArchiveSenderJobs", () => {
  beforeEach(() => {
    mockEnqueueBackgroundJob.mockReset();
    mockEnqueueBackgroundJob.mockResolvedValue("bullmq");
    mockCreateEmailProvider.mockReset();
    mockBulkArchiveFromSenders.mockReset();
    mockBulkArchiveSenderOrThrow.mockReset();
    mockSaveBulkArchiveTotalItems.mockReset();
    mockSaveBulkArchiveProgress.mockReset();
    mockSaveQueuedBulkArchiveSenderStatuses.mockReset();
    mockSaveCompletedBulkArchiveSenderStatus.mockReset();
  });

  it("queues one background job per unique sender", async () => {
    const logger = createScopedLogger("bulk-archive-queue-test");

    const queuedSenders = await enqueueBulkArchiveSenderJobs({
      emailAccountId: "account-1",
      ownerEmail: "owner@example.com",
      provider: "google",
      froms: [
        " Sender@example.com ",
        "sender@example.com",
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
        sender: "Sender@example.com",
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
    expect(mockSaveBulkArchiveTotalItems).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      totalItems: 2,
    });
    expect(mockSaveQueuedBulkArchiveSenderStatuses).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      senders: ["Sender@example.com", "other@example.com"],
    });
    expect(
      mockSaveBulkArchiveTotalItems.mock.invocationCallOrder[0],
    ).toBeLessThan(mockEnqueueBackgroundJob.mock.invocationCallOrder[0]);
  });

  it("queues Outlook sender archives with the real provider", async () => {
    const logger = createScopedLogger("bulk-archive-queue-test");

    await enqueueBulkArchiveSenderJobs({
      emailAccountId: "account-1",
      ownerEmail: "owner@example.com",
      provider: "microsoft",
      froms: ["sender@example.com"],
      logger,
    });

    expect(mockEnqueueBackgroundJob).toHaveBeenCalledWith({
      topic: MAIL_BULK_ARCHIVE_TOPIC,
      body: {
        emailAccountId: "account-1",
        ownerEmail: "owner@example.com",
        provider: "microsoft",
        sender: "sender@example.com",
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

describe("executeBulkArchiveSenderJob", () => {
  beforeEach(() => {
    mockCreateEmailProvider.mockReset();
    mockBulkArchiveFromSenders.mockReset();
    mockBulkArchiveSenderOrThrow.mockReset();
    mockSaveBulkArchiveProgress.mockReset();
    mockSaveCompletedBulkArchiveSenderStatus.mockReset();
  });

  it("uses the Gmail-specific archive path for Google jobs", async () => {
    const logger = createScopedLogger("bulk-archive-queue-test");
    const { GmailProvider } = await import("@/utils/email/google");

    mockBulkArchiveSenderOrThrow.mockResolvedValue(7);
    mockCreateEmailProvider.mockResolvedValue(new GmailProvider());

    await executeBulkArchiveSenderJob({
      emailAccountId: "account-1",
      ownerEmail: "owner@example.com",
      provider: "google",
      sender: "sender@example.com",
      logger,
    });

    expect(mockBulkArchiveSenderOrThrow).toHaveBeenCalledWith(
      "sender@example.com",
      "owner@example.com",
      "account-1",
    );
    expect(mockBulkArchiveFromSenders).not.toHaveBeenCalled();
    expect(mockSaveBulkArchiveProgress).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      incrementCompleted: 1,
    });
    expect(mockSaveCompletedBulkArchiveSenderStatus).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      sender: "sender@example.com",
      archivedCount: 7,
    });
  });

  it("uses the Outlook sender archive path for Outlook jobs", async () => {
    const logger = createScopedLogger("bulk-archive-queue-test");
    const { OutlookProvider } = await import("@/utils/email/microsoft");

    mockBulkArchiveSenderOrThrow.mockResolvedValue(3);
    mockCreateEmailProvider.mockResolvedValue(new OutlookProvider());

    await executeBulkArchiveSenderJob({
      emailAccountId: "account-1",
      ownerEmail: "owner@example.com",
      provider: "microsoft",
      sender: "sender@example.com",
      logger,
    });

    expect(mockBulkArchiveSenderOrThrow).toHaveBeenCalledWith(
      "sender@example.com",
      "owner@example.com",
      "account-1",
    );
    expect(mockBulkArchiveFromSenders).not.toHaveBeenCalled();
    expect(mockSaveBulkArchiveProgress).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      incrementCompleted: 1,
    });
    expect(mockSaveCompletedBulkArchiveSenderStatus).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      sender: "sender@example.com",
      archivedCount: 3,
    });
  });
});
