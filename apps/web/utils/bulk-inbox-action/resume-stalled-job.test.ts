import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { enqueueBulkInboxActionChunk } from "@/utils/bulk-inbox-action/enqueue";
import { createScopedLogger } from "@/utils/logger";
import {
  BULK_INBOX_ACTION_STALLED_AFTER_MS,
  resumeStalledBulkInboxActionJob,
  resumeStalledBulkInboxActionJobs,
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

  it("requeues a job whose chunk started and died with a new token", async () => {
    const job = stalledJob({ leaseExpiresAt: new Date(Date.now() - 60_000) });

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
    // A stale redelivery of the dead chunk must not run beside the new one.
    expect(update.data.chunkToken).not.toBe("old-token");
    expect(update.data.leaseExpiresAt).toBeNull();
    expect(enqueueBulkInboxActionChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        chunkToken: update.data.chunkToken,
      }),
    );
  });

  it("resends the same token when the queued chunk never started", async () => {
    await resumeStalledBulkInboxActionJob({ job: stalledJob(), logger });

    const update = vi.mocked(prisma.bulkInboxActionJob.updateMany).mock
      .calls[0][0] as any;
    // The original delivery stays valid, so a slow queue still runs it.
    expect(update.data.chunkToken).toBe("old-token");
    // A distinct resend keeps queue deduplication from dropping it.
    expect(enqueueBulkInboxActionChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        chunkToken: "old-token",
        resendCount: 1,
      }),
    );
  });

  it("does not fail a healthy job while the queue is about 40 minutes behind", async () => {
    // Its chunk was resent twice and has still not been delivered.
    const minutesBehind = 40;
    await resumeStalledBulkInboxActionJob({
      job: stalledJob({
        recoveryCount: 2,
        updatedAt: new Date(Date.now() - (minutesBehind - 10) * 60_000),
      }),
      logger,
    });

    expect(prisma.bulkInboxActionJob.updateMany).not.toHaveBeenCalled();
    expect(enqueueBulkInboxActionChunk).not.toHaveBeenCalled();
  });

  it("waits twice as long before each retry of a chunk that never started", async () => {
    const wait = BULK_INBOX_ACTION_STALLED_AFTER_MS * 2;

    await resumeStalledBulkInboxActionJob({
      job: stalledJob({
        recoveryCount: 1,
        updatedAt: new Date(Date.now() - wait + 60_000),
      }),
      logger,
    });
    expect(prisma.bulkInboxActionJob.updateMany).not.toHaveBeenCalled();

    await resumeStalledBulkInboxActionJob({
      job: stalledJob({
        recoveryCount: 1,
        updatedAt: new Date(Date.now() - wait - 1000),
      }),
      logger,
    });
    expect(enqueueBulkInboxActionChunk).toHaveBeenCalledTimes(1);
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
      job: stalledJob({
        recoveryCount: 3,
        leaseExpiresAt: new Date(Date.now() - 60_000),
      }),
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

describe("resumeStalledBulkInboxActionJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.bulkInboxActionJob.updateMany.mockResolvedValue({ count: 1 });
  });

  it("resumes running jobs that nobody is reading", async () => {
    prisma.bulkInboxActionJob.findMany.mockResolvedValue([
      stalledJob({ id: "job-1" }),
      stalledJob({ id: "job-2" }),
    ] as any);

    const result = await resumeStalledBulkInboxActionJobs({ logger });

    const query = vi.mocked(prisma.bulkInboxActionJob.findMany).mock
      .calls[0][0] as any;
    expect(query.where.status).toBe("RUNNING");
    expect(enqueueBulkInboxActionChunk).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ checked: 2 });
  });

  it("only selects jobs whose retry wait is over", async () => {
    prisma.bulkInboxActionJob.findMany.mockResolvedValue([]);
    const now = Date.now();

    await resumeStalledBulkInboxActionJobs({ logger });

    const query = vi.mocked(prisma.bulkInboxActionJob.findMany).mock
      .calls[0][0] as any;
    const waitFor = (recoveryCount: unknown) => {
      const branch = query.where.OR.find(
        (condition: any) =>
          condition.leaseExpiresAt === null &&
          JSON.stringify(condition.recoveryCount) ===
            JSON.stringify(recoveryCount),
      );
      return now - branch.updatedAt.lt.getTime();
    };
    // Jobs still backing off can't fill the batch ahead of due ones.
    const minutes = 60_000;
    expect(Math.round(waitFor(0) / minutes)).toBe(10);
    expect(Math.round(waitFor(1) / minutes)).toBe(20);
    expect(Math.round(waitFor(2) / minutes)).toBe(40);
    expect(Math.round(waitFor({ gte: 3 }) / minutes)).toBe(80);
  });

  it("keeps sweeping when one job fails to resume", async () => {
    prisma.bulkInboxActionJob.findMany.mockResolvedValue([
      stalledJob({ id: "job-1" }),
      stalledJob({ id: "job-2" }),
    ] as any);
    prisma.bulkInboxActionJob.updateMany
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValue({ count: 1 });

    await resumeStalledBulkInboxActionJobs({ logger });

    expect(enqueueBulkInboxActionChunk).toHaveBeenCalledTimes(1);
    expect(enqueueBulkInboxActionChunk).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-2" }),
    );
  });
});

function stalledJob(
  overrides: Partial<{
    id: string;
    leaseExpiresAt: Date | null;
    updatedAt: Date;
    recoveryCount: number;
  }> = {},
) {
  return {
    id: "job-1",
    status: "RUNNING" as const,
    chunkToken: "old-token",
    leaseExpiresAt: null as Date | null,
    updatedAt: new Date(Date.now() - BULK_INBOX_ACTION_STALLED_AFTER_MS - 1000),
    recoveryCount: 0,
    ...overrides,
  };
}
