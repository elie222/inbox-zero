import { NextResponse } from "next/server";
import { MeetingJoinRule } from "@/generated/prisma/enums";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetMeetingRecorderSettingsResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "user/meeting-recorder",
  async (request) => {
    const result = await getData({
      emailAccountId: request.auth.emailAccountId,
    });
    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      meetingRecorderEnabled: true,
      meetingRecorderJoinRule: true,
      meetingRecorderRecapEmailEnabled: true,
      meetingRecorderFollowUpDraftEnabled: true,
    },
  });

  return {
    enabled: emailAccount?.meetingRecorderEnabled ?? false,
    joinRule: emailAccount?.meetingRecorderJoinRule ?? MeetingJoinRule.ALL,
    recapEmailEnabled: emailAccount?.meetingRecorderRecapEmailEnabled ?? true,
    followUpDraftEnabled:
      emailAccount?.meetingRecorderFollowUpDraftEnabled ?? true,
  };
}
