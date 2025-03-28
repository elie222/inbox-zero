import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import type { CleanupJob, CleanupThreadStatus } from "@prisma/client";

export type JobStatusResponse = Pick<CleanupJob, "status"> & {
  total: number;
  completed: number;
  progress: number;
  archived: number;
};

export const GET = withError(
  async (
    _request: Request,
    { params }: { params: Promise<Record<string, string>> },
  ) => {
    const session = await auth();
    if (!session?.user.id)
      return NextResponse.json({ error: "Not authenticated" });

    const resolvedParams = await params;
    const jobId = resolvedParams.jobId;
    if (!jobId) return NextResponse.json({ error: "Job ID is required" });

    const [job, statusCounts, archived] = await Promise.all([
      prisma.cleanupJob.findUnique({
        where: {
          id: jobId,
          userId: session.user.id,
        },
        select: { status: true },
      }),
      prisma.cleanupThread.groupBy({
        by: ["status"],
        where: {
          jobId,
          userId: session.user.id,
        },
        _count: true,
      }),
      prisma.cleanupThread.count({
        where: {
          jobId,
          userId: session.user.id,
          archived: true,
        },
      }),
    ]);

    if (!job) return NextResponse.json({ error: "Job not found" });

    // Convert the groupBy result into a record of status counts
    const counts: Record<CleanupThreadStatus, number> = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      FAILED: 0,
    };

    statusCounts.forEach((count) => {
      counts[count.status] = count._count;
    });

    const total = counts.PENDING + counts.PROCESSING + counts.COMPLETED;

    const result: JobStatusResponse = {
      ...job,
      total,
      completed: counts.COMPLETED,
      progress: Math.round((counts.COMPLETED / total) * 100),
      archived,
    };

    return NextResponse.json(result);
  },
);
