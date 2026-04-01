import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { isMobileReviewEnabled } from "@/utils/mobile-review";

export const GET = withError("mobile-review/status", async () => {
  return NextResponse.json({ enabled: isMobileReviewEnabled() });
});
