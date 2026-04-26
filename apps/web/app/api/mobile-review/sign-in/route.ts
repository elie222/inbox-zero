import { z } from "zod";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { createMobileReviewSession } from "@/utils/mobile-review";

const signInSchema = z.object({
  code: z.string().trim().min(1).max(128),
  email: z.string().trim().email(),
});

export const POST = withError("mobile-review/sign-in", async (request) => {
  const body = signInSchema.parse(await request.json());
  const result = await createMobileReviewSession({
    code: body.code,
    email: body.email,
    logger: request.logger,
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
