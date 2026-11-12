import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { enqueueBulkInboxActionChunk } from "@/utils/bulk-inbox-action/enqueue";
import { createScopedLogger } from "@/utils/logger";
import {
  BULK_INBOX_ACTION_STALLED_AFTER_MS,
  resumeStalledBulkInboxActionJob,
} from "./resume-stalled-job";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/bulk-inbox-action/enqueue", () => ({
  enqueueBulkInboxActionChunk: vi.fn(),
}));

const logger = createScopedLogger("bulk-inbox-action-resume-test");

describe("resumeStalledBulkInboxActionJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.bulkInboxActionJob.updateMany.mockResolvedValue({ count: 1 });
  });

  it("requeues a running job whose chunk died without a hand-off", async () => {
    const job = stalledJob();

    await resumeStalledBulkInboxActionJob({ job, logger });

    const update = vi.mocked(prisma.bulkInboxActionJob.updateMany).mock
      .calls[0][0] as any;
    // Guarded on the state that was read, so two pollers can't both resume it.
    expect(update.where).toMatchObject({
      id: "job-1",
      status: "RUNNING",
      chunkToken: "old-token",
      updatedAt: job.updatedAt,
    });
    expect(update.data.chunkToken).not.toBe("old-token");
    expect(enqueueBulkInboxActionChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        chunkToken: update.data.chunkToken,
      }),
    );
  });

  it("leaves a job alone while a chunk holds its lease", async () => {
    await resumeStalledBulkInboxActionJob({
      job: stalledJob({ leaseExpiresAt: new Date(Date.now() + 60_000) }),
      logger,
    });

    expect(prisma.bulkInboxActionJob.updateMany).not.toHaveBeenCalled();
    expect(enqueueBulkInboxActionChunk).not.toHaveBeenCalled();
  });

  it("leaves a job alone that saved progress recently", async () => {
    await resumeStalledBulkInboxActionJob({
      job: stalledJob({ updatedAt: new Date(Date.now() - 60_000) }),
      logger,
    });

    expect(prisma.bulkInboxActionJob.updateMany).not.toHaveBeenCalled();
  });

  it("marks the job failed once it has been resumed too often", async () => {
    await resumeStalledBulkInboxActionJob({
      job: stalledJob({ recoveryCount: 3 }),
      logger,
    });

    expect(prisma.bulkInboxActionJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(enqueueBulkInboxActionChunk).not.toHaveBeenCalled();
  });

  it("does not queue anything when another poller resumed the job first", async () => {
    prisma.bulkInboxActionJob.updateMany.mockResolvedValue({ count: 0 });

    await resumeStalledBulkInboxActionJob({ job: stalledJob(), logger });

    expect(enqueueBulkInboxActionChunk).not.toHaveBeenCalled();
  });
});

function stalledJob(
  overrides: Partial<{
    leaseExpiresAt: Date | null;
    updatedAt: Date;
    recoveryCount: number;
  }> = {},
) {
  return {
    id: "job-1",
    status: "RUNNING" as const,
    chunkToken: "old-token",
    leaseExpiresAt: null,
    updatedAt: new Date(Date.now() - BULK_INBOX_ACTION_STALLED_AFTER_MS - 1000),
    recoveryCount: 0,
    ...overrides,
  };
}
