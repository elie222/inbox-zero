import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetMeetingBriefsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("user/meeting-briefs", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      meetingBriefingsEnabled: true,
      meetingBriefingsMinutesBefore: true,
      meetingBriefings: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          createdAt: true,
          eventTitle: true,
          eventStartTime: true,
          guestCount: true,
          status: true,
        },
      },
    },
  });

  return {
    enabled: emailAccount?.meetingBriefingsEnabled ?? false,
    minutesBefore: emailAccount?.meetingBriefingsMinutesBefore,
    recentBriefings: emailAccount?.meetingBriefings ?? [],
  };
}
