import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetDigestScheduleResponse = Awaited<
  ReturnType<typeof getDigestSchedule>
>;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const result = await getDigestSchedule({ emailAccountId });
  return NextResponse.json(result);
});

async function getDigestSchedule({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const schedule = await prisma.schedule.findUnique({
    where: { emailAccountId },
    select: {
      id: true,
      intervalDays: true,
      occurrences: true,
      daysOfWeek: true,
      timeOfDay: true,
      lastOccurrenceAt: true,
      nextOccurrenceAt: true,
    },
  });

  return schedule;
}
