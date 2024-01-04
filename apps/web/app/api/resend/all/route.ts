import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { env } from "@/env.mjs";
import { hasCronSecret } from "@/utils/cron";
import { Frequency } from "@prisma/client";
import { captureException } from "@/utils/error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export type SendWeeklyStatsAllUpdateResponse = Awaited<
  ReturnType<typeof sendWeeklyStatsAllUpdate>
>;

async function sendWeeklyStatsAllUpdate() {
  const users = await prisma.user.findMany({
    select: { email: true },
    where: { statsEmailFrequency: { not: Frequency.NEVER } },
  });

  await Promise.all(
    users.map(async (user) => {
      return fetch(`${env.NEXT_PUBLIC_BASE_URL}/api/resend`, {
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

  const result = await sendWeeklyStatsAllUpdate();

  return NextResponse.json(result);
});
