import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createMobileReviewSession } from "@/utils/mobile-review";
import { signInSchema } from "@/utils/actions/mobile-review.validation";

export const POST = withError("mobile-review/sign-in", async (request) => {
  const body = signInSchema.parse(await request.json());
  const result = await createMobileReviewSession({
    code: body.code,
    userAgent: request.headers.get("user-agent"),
    ipAddress: getIpAddress(request),
  });

  request.logger.info("Created mobile review session", {
    reviewUserEmail: result.userEmail,
    reviewUserId: result.userId,
    reviewEmailAccountId: result.emailAccountId,
  });

  const response = NextResponse.json({ success: true });
  response.cookies.set(result.sessionCookie.name, result.sessionCookie.value, {
    ...result.sessionCookie.options,
  });
  response.headers.set("Cache-Control", "no-store");

  return response;
});

function getIpAddress(request: Request): string | null {
  const forwardedForHeader =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    request.headers.get("x-forwarded-for");

  return forwardedForHeader?.split(",")[0]?.trim() || null;
}
