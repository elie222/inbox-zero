import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getMobileReviewAccessStatus } from "@/utils/mobile-review";

export const GET = withError("mobile-review/status", async (request) => {
  const { enabled } = await getMobileReviewAccessStatus({
    logger: request.logger,
  });

  const response = NextResponse.json({ enabled });
  response.headers.set("Cache-Control", "no-store");

  return response;
});
