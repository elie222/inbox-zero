import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetBulkInboxActionJobResponse = NonNullable<
  Awaited<ReturnType<typeof getJob>>
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

    return NextResponse.json(job);
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
      error: true,
      completedAt: true,
    },
  });
}
