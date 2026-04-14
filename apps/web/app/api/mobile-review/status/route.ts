import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getMobileReviewAccessStatus } from "@/utils/mobile-review";

export const GET = withError("mobile-review/status", async (request) => {
  const { enabled } = await getMobileReviewAccessStatus({
    logger: request.logger,
  });
  return NextResponse.json({ enabled });
});
