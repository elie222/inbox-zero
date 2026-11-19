import { NextResponse } from "next/server";
import { enqueueBulkInboxActionChunk } from "@/utils/bulk-inbox-action/enqueue";
import { processBulkInboxActionJobChunk } from "@/utils/bulk-inbox-action/process-job";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { withQstashOrInternal } from "@/utils/qstash";
import { bulkInboxActionProcessBody } from "./validation";

export const maxDuration = 300;

export const POST = withError(
  "bulk-inbox-action/process",
  withQstashOrInternal(async (request) => {
    const { jobId, chunkToken } = bulkInboxActionProcessBody.parse(
      await request.json(),
    );
    const logger = request.logger.with({ bulkInboxActionJobId: jobId });

    const outcome = await processBulkInboxActionJobChunk({
      jobId,
      chunkToken,
      logger,
    });

    // Another delivery holds the lease. Fail so the queue retries later and
    // resumes the job if that holder died.
    if (outcome.status === "busy") {
      return NextResponse.json({ status: "busy" }, { status: 503 });
    }

    if (outcome.status === "continue") {
      try {
        await enqueueBulkInboxActionChunk({
          jobId,
          chunkToken: outcome.nextChunkToken,
          logger,
        });
      } catch (error) {
        // Hand the job back to this delivery's token, so the queue's retry of
        // it resumes the job instead of being ignored as stale.
        // Skip it if the next chunk was delivered after all and holds a lease.
        await prisma.bulkInboxActionJob.updateMany({
          where: {
            id: jobId,
            status: "RUNNING",
            chunkToken: outcome.nextChunkToken,
            leaseExpiresAt: null,
          },
          data: { chunkToken },
        });
        throw error;
      }
    }

    return NextResponse.json({ status: outcome.status });
  }),
);
