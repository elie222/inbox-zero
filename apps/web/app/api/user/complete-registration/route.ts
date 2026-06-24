import { after, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/utils/auth";
import { withError } from "@/utils/middleware";
import {
  getRegistrationCompletedConversionEligibility,
  trackRegistrationCompletedConversion,
} from "@/utils/analytics/server-conversions";
import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

export const POST = withError("complete-registration", async (request) => {
  const logger = request.logger;
  const session = await auth(request.headers);
  if (!session?.user.email) {
    // This endpoint is fire-and-forget from onboarding pages; missing auth is a
    // terminal no-op, not a state callers should retry or surface to users.
    return NextResponse.json({ success: false, reason: "not_authenticated" });
  }

  const headersList = await headers();
  const eventSourceUrl = headersList.get("referer");
  const userAgent = headersList.get("user-agent");
  const ip = getIp(headersList);

  const c = await cookies();

  const fbc = c.get("_fbc")?.value;
  const fbp = c.get("_fbp")?.value;

  const conversionEligibility =
    await getRegistrationCompletedConversionEligibility(
      session.user.id,
      logger,
    );

  if (conversionEligibility.eligible) {
    const createdAt = conversionEligibility.createdAt;

    after(async () => {
      try {
        await trackRegistrationCompletedConversion({
          userId: session.user.id,
          email: session.user.email,
          createdAt,
          eventSourceUrl: eventSourceUrl || "",
          ipAddress: ip || "",
          userAgent: userAgent || "",
          fbc: fbc || "",
          fbp: fbp || "",
          logger,
        });
      } catch (error) {
        logger.error("Registration conversion tracking failed", {
          error,
          userId: session.user.id,
        });
      }
    });
  }

  return NextResponse.json({
    success: true,
    clientConversionEligible: conversionEligibility.eligible,
  });
});

function getIp(headersList: ReadonlyHeaders) {
  const FALLBACK_IP_ADDRESS = "0.0.0.0";
  const forwardedFor = headersList.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0] ?? FALLBACK_IP_ADDRESS;
  }

  return headersList.get("x-real-ip") ?? FALLBACK_IP_ADDRESS;
}
