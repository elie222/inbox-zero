import { NextRequest, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { sendCompleteRegistrationEvent } from "@/utils/fb";

export type CompleteRegistrationBody = {};

export const POST = withError(async (request: NextRequest) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const eventSourceUrl = headers().get("referer");
  const userAgent = headers().get("user-agent");
  const ip = getIp();

  const c = cookies();

  const fbc = c.get("_fbc")?.value;
  const fbp = c.get("_fbp")?.value;

  const result = await sendCompleteRegistrationEvent({
    userId: session.user.id,
    email: session.user.email,
    eventSourceUrl: eventSourceUrl || "",
    ipAddress: ip || "",
    userAgent: userAgent || "",
    fbc: fbc || "",
    fbp: fbp || "",
  });

  return NextResponse.json(result);
});

function getIp() {
  const FALLBACK_IP_ADDRESS = "0.0.0.0";
  const forwardedFor = headers().get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0] ?? FALLBACK_IP_ADDRESS;
  }

  return headers().get("x-real-ip") ?? FALLBACK_IP_ADDRESS;
}
