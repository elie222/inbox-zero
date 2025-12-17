import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/utils/auth";
import { withError } from "@/utils/middleware";
import { sendCompleteRegistrationEvent } from "@/utils/fb";
import { trackUserSignedUp } from "@/utils/posthog";
import prisma from "@/utils/prisma";
import { ONE_HOUR_MS } from "@/utils/date";
import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import type { Logger } from "@/utils/logger";

export const POST = withError("complete-registration", async (request) => {
  const logger = request.logger;
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const headersList = await headers();
  const eventSourceUrl = headersList.get("referer");
  const userAgent = headersList.get("user-agent");
  const ip = getIp(headersList);

  const c = await cookies();

  const fbc = c.get("_fbc")?.value;
  const fbp = c.get("_fbp")?.value;

  const fbPromise = sendCompleteRegistrationEvent({
    userId: session.user.id,
    email: session.user.email,
    eventSourceUrl: eventSourceUrl || "",
    ipAddress: ip || "",
    userAgent: userAgent || "",
    fbc: fbc || "",
    fbp: fbp || "",
  });
  const posthogPromise = storePosthogSignupEvent(
    session.user.id,
    session.user.email,
    logger,
  );

  const [fbResult, posthogResult] = await Promise.allSettled([
    fbPromise,
    posthogPromise,
  ]);

  if (fbResult.status === "rejected") {
    logger.error("Facebook tracking failed", {
      error: fbResult.reason,
      email: session.user.email,
    });
  }

  if (posthogResult.status === "rejected") {
    logger.error("Posthog tracking failed", {
      error: posthogResult.reason,
      email: session.user.email,
    });
  }

  return NextResponse.json({ success: true });
});

function getIp(headersList: ReadonlyHeaders) {
  const FALLBACK_IP_ADDRESS = "0.0.0.0";
  const forwardedFor = headersList.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0] ?? FALLBACK_IP_ADDRESS;
  }

  return headersList.get("x-real-ip") ?? FALLBACK_IP_ADDRESS;
}

async function storePosthogSignupEvent(
  userId: string,
  email: string,
  logger: Logger,
) {
  const userCreatedAt = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!userCreatedAt) {
    logger.error("storePosthogSignupEvent: User not found", { userId });
    return;
  }

  const ONE_HOUR_AGO = new Date(Date.now() - ONE_HOUR_MS);

  if (userCreatedAt.createdAt < ONE_HOUR_AGO) {
    logger.warn("storePosthogSignupEvent: User created more than an hour ago", {
      userId,
    });
    return;
  }

  return trackUserSignedUp(email, userCreatedAt.createdAt);
}
