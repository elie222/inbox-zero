import { type NextRequest, NextResponse } from "next/server";
import { cookies, headers, type UnsafeUnwrappedHeaders } from "next/headers";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { sendCompleteRegistrationEvent } from "@/utils/fb";
import { posthogCaptureEvent } from "@/utils/posthog";
import prisma from "@/utils/prisma";
import { ONE_HOUR_MS } from "@/utils/date";

export type CompleteRegistrationBody = {};

export const POST = withError(async (_request: NextRequest) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const eventSourceUrl = (await headers()).get("referer");
  const userAgent = (await headers()).get("user-agent");
  const ip = getIp();

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
  );

  await Promise.allSettled([fbPromise, posthogPromise]);

  return NextResponse.json({ success: true });
});

function getIp() {
  const FALLBACK_IP_ADDRESS = "0.0.0.0";
  const forwardedFor = (headers() as unknown as UnsafeUnwrappedHeaders).get(
    "x-forwarded-for",
  );

  if (forwardedFor) {
    return forwardedFor.split(",")[0] ?? FALLBACK_IP_ADDRESS;
  }

  return (
    (headers() as unknown as UnsafeUnwrappedHeaders).get("x-real-ip") ??
    FALLBACK_IP_ADDRESS
  );
}

async function storePosthogSignupEvent(userId: string, email: string) {
  const userCreatedAt = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });
  if (!userCreatedAt) {
    console.error(`storePosthogSignupEvent: User not found: ${userId}`);
    return;
  }

  const ONE_HOUR_AGO = new Date(Date.now() - ONE_HOUR_MS);

  if (userCreatedAt.createdAt < ONE_HOUR_AGO) {
    console.error(
      `storePosthogSignupEvent: User created more than an hour ago: ${userId}`,
    );
    return;
  }

  return posthogCaptureEvent(
    email,
    "User signed up",
    {
      $set_once: { createdAt: userCreatedAt.createdAt },
    },
    true,
  );
}
