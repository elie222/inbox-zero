import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { sleep } from "@/utils/sleep";
import { env } from "@/env.mjs";
import { hasCronSecret } from "@/utils/cron";
import { Frequency } from "@prisma/client";

export const dynamic = "force-dynamic";

export type SendWeeklyStatsAllUpdateResponse = Awaited<
  ReturnType<typeof sendWeeklyStatsAllUpdate>
>;

async function sendWeeklyStatsAllUpdate() {
  const users = await prisma.user.findMany({
    select: { email: true },
    where: { statsEmailFrequency: { not: Frequency.NEVER } },
  });

  users.map(async (user) => {
    fetch(`${env.NEXT_PUBLIC_BASE_URL}/api/resend`, {
      method: "POST",
      body: JSON.stringify({ email: user.email }),
      headers: {
        authorization: `Bearer ${env.CRON_SECRET}`,
      },
    });
  });

  // make sure the requests go through
  // we don't need to await responses
  await sleep(5_000);

  return { count: users.length };
}

export const GET = withError(async (request) => {
  if (!hasCronSecret(request))
    return new Response("Unauthorized", { status: 401 });

  const result = await sendWeeklyStatsAllUpdate();

  return NextResponse.json(result);
});
