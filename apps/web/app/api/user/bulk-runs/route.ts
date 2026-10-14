import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getBulkRunStatus } from "@/utils/bulk-rules/status";

export type GetBulkRunsResponse = Awaited<ReturnType<typeof getBulkRunStatus>>;
export const GET = withAuth("user/bulk-runs", async (request) =>
  NextResponse.json(await getBulkRunStatus(request.auth.userId)),
);
