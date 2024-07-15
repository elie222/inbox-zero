import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { hasCronSecret } from "@/utils/cron";
import { Frequency } from "@prisma/client";
import { captureException } from "@/utils/error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function sendSummaryAllUpdate() {
  const users = await prisma.user.findMany({
    select: { email: true },
    where: { summaryEmailFrequency: { not: Frequency.NEVER } },
  });

  await Promise.all(
    users.map(async (user) => {
      return fetch(`${env.NEXT_PUBLIC_BASE_URL}/api/resend/summary`, {
        method: "POST",
        body: JSON.stringify({ email: user.email }),
        headers: {
          authorization: `Bearer ${env.CRON_SECRET}`,
        },
      });
    }),
  );

  return { count: users.length };
}

export const GET = withError(async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/resend/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendSummaryAllUpdate();

  return NextResponse.json(result);
});
