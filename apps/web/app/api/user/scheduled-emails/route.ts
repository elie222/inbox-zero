import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { Prisma } from "@/generated/prisma/client";
import type { ScheduledEmailStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";

const UPCOMING_STATUSES: ScheduledEmailStatus[] = [
  "PENDING",
  "PROCESSING",
  "BLOCKED_AUTH",
  "FAILED",
  "UNCERTAIN",
];

type UpcomingScheduledEmail = {
  id: string;
  status: ScheduledEmailStatus;
  sendAt: Date;
  threadId: string | null;
  error: string | null;
  to: string | null;
  subject: string | null;
};

export type ScheduledEmailsResponse = Awaited<ReturnType<typeof getThreadData>>;
export type UpcomingScheduledEmailsResponse = Awaited<
  ReturnType<typeof getUpcomingData>
>;

export const GET = withEmailAccount(async (request) => {
  const threadId = request.nextUrl.searchParams.get("threadId");
  const { emailAccountId } = request.auth;
  return NextResponse.json(
    threadId
      ? await getThreadData(emailAccountId, threadId)
      : await getUpcomingData(emailAccountId),
  );
});

async function getThreadData(emailAccountId: string, threadId: string) {
  const scheduledEmails = await prisma.scheduledEmail.findMany({
    where: {
      emailAccountId,
      threadId,
      heldForUndo: false,
      status: { not: "CANCELLED" },
      OR: [
        { status: { not: "SENT" } },
        { reminderStatus: { in: ["PENDING", "PROCESSING"] } },
        { sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      ],
    },
    select: {
      id: true,
      status: true,
      sendAt: true,
      remindAt: true,
      reminderStatus: true,
      sentAt: true,
      error: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return { scheduledEmails };
}

/**
 * Reads recipient and subject out of the payload JSON instead of selecting it:
 * a scheduled send carries its body and attachments, which run to megabytes.
 */
async function getUpcomingData(emailAccountId: string) {
  const scheduledEmails = await prisma.$queryRaw<UpcomingScheduledEmail[]>`
    SELECT
      "id",
      "status",
      "sendAt",
      "threadId",
      "error",
      "payload" -> 'email' ->> 'to' AS "to",
      "payload" -> 'email' ->> 'subject' AS "subject"
    FROM "ScheduledEmail"
    WHERE "emailAccountId" = ${emailAccountId}
      AND NOT "heldForUndo"
      AND "status"::text IN (${Prisma.join(UPCOMING_STATUSES)})
    ORDER BY "sendAt" ASC
    LIMIT 200
  `;
  return { scheduledEmails };
}
