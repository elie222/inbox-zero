import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetMeetingBriefsSettingsResponse = Awaited<
  ReturnType<typeof getData>
>;

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
    },
  });

  return {
    enabled: emailAccount?.meetingBriefingsEnabled ?? false,
    minutesBefore: emailAccount?.meetingBriefingsMinutesBefore,
  };
}
