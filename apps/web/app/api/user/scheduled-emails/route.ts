import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type ScheduledEmailsResponse = Awaited<ReturnType<typeof getData>>;
export const GET = withEmailAccount(async (request) => {
  const threadId = request.nextUrl.searchParams.get("threadId");
  if (!threadId)
    return NextResponse.json(
      { error: "Thread ID is required" },
      { status: 400 },
    );
  return NextResponse.json(
    await getData(request.auth.emailAccountId, threadId),
  );
});

async function getData(emailAccountId: string, threadId: string) {
  const scheduledEmails = await prisma.scheduledEmail.findMany({
    where: {
      emailAccountId,
      threadId,
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
