import { z } from "zod";
import { NextResponse } from "next/server";
import { subHours } from "date-fns";
import { sendSummaryEmail } from "@inboxzero/resend";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { hasCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus } from "@prisma/client";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

const sendSummaryEmailBody = z.object({ email: z.string() });

async function sendEmail({ email }: { email: string }) {
  // run every 7 days. but overlap by 1 hour
  const days = 7;
  const cutOffDate = subHours(new Date(), days * 24 + 1);

  const user = await prisma.user.findUnique({
    where: {
      email,
      OR: [
        { lastSummaryEmailAt: { lt: cutOffDate } },
        { lastSummaryEmailAt: null },
      ],
    },
    select: {
      coldEmails: { where: { createdAt: { gt: cutOffDate } } },
      _count: {
        select: {
          executedRules: {
            where: {
              status: ExecutedRuleStatus.PENDING,
              createdAt: { gt: cutOffDate },
            },
          },
        },
      },
    },
  });

  if (!user) return { success: false };

  const coldEmailers = user.coldEmails.map((e) => ({
    from: e.fromEmail,
    subject: "",
  }));
  const pendingCount = user._count.executedRules;
  const shouldSendEmail = coldEmailers.length && pendingCount;

  await Promise.all([
    shouldSendEmail
      ? sendSummaryEmail({
          to: email,
          emailProps: {
            baseUrl: env.NEXT_PUBLIC_BASE_URL,
            coldEmailers,
            pendingCount,
          },
        })
      : async () => {},
    prisma.user.update({
      where: { email },
      data: { lastSummaryEmailAt: new Date() },
    }),
  ]);

  return { success: true };
}

export const GET = withError(async () => {
  const session = await auth();

  // send to self
  const email = session?.user.email;
  if (!email) return NextResponse.json({ error: "Not authenticated" });

  const result = await sendEmail({ email });

  return NextResponse.json(result);
});

export const POST = withError(async (request: Request) => {
  console.log("sending summary email to user");
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized cron request: resend"));
    return new Response("Unauthorized", { status: 401 });
  }

  const json = await request.json();
  const body = sendSummaryEmailBody.parse(json);

  const result = await sendEmail(body);

  return NextResponse.json(result);
});
