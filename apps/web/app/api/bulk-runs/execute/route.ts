import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import { processNextBulkRun } from "@/utils/bulk-rules/worker";

export const maxDuration = 300;
export const POST = withError(
  "bulk-runs/execute",
  withQstashOrInternal(async (request) =>
    NextResponse.json(await processNextBulkRun(request.logger)),
  ),
);
