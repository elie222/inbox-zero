import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { resumeStalledBulkInboxActionJob } from "@/utils/bulk-inbox-action/resume-stalled-job";

export type GetBulkInboxActionJobResponse = Omit<
  NonNullable<Awaited<ReturnType<typeof getJob>>>,
  "chunkToken" | "leaseExpiresAt" | "updatedAt" | "recoveryCount"
>;

export const GET = withEmailAccount(
  "user/bulk-inbox-action/job",
  async (request, { params }) => {
    const { jobId } = await params;

    const job = await getJob({
      jobId,
      emailAccountId: request.auth.emailAccountId,
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }

    // The card polls a running job, which is when a stalled one gets noticed.
    const { chunkToken, leaseExpiresAt, updatedAt, recoveryCount, ...status } =
      job;
    await resumeStalledBulkInboxActionJob({
      job: {
        id: job.id,
        status: job.status,
        chunkToken,
        leaseExpiresAt,
        updatedAt,
        recoveryCount,
      },
      logger: request.logger,
    });

    return NextResponse.json(status);
  },
);

async function getJob({
  jobId,
  emailAccountId,
}: {
  jobId: string;
  emailAccountId: string;
}) {
  return prisma.bulkInboxActionJob.findFirst({
    where: { id: jobId, emailAccountId },
    select: {
      id: true,
      status: true,
      processedCount: true,
      matchedCount: true,
      actedCount: true,
      skippedCount: true,
      failedCount: true,
      limitReached: true,
      chunkToken: true,
      leaseExpiresAt: true,
      updatedAt: true,
      recoveryCount: true,
      error: true,
      completedAt: true,
    },
  });
}
