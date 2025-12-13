import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetMeetingBriefsHistoryResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "user/meeting-briefs/history",
  async (request) => {
    const emailAccountId = request.auth.emailAccountId;
    const result = await getData({ emailAccountId });
    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const briefings = await prisma.meetingBriefing.findMany({
    where: { emailAccountId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      createdAt: true,
      eventTitle: true,
      guestCount: true,
      status: true,
    },
  });

  return { briefings };
}
