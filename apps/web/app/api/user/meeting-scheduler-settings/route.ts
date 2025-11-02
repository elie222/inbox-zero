import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetMeetingSchedulerSettingsResponse = Awaited<
  ReturnType<typeof getMeetingSchedulerSettings>
>;

export const GET = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await getMeetingSchedulerSettings({ emailAccountId });
  return NextResponse.json(result);
});

async function getMeetingSchedulerSettings({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const settings = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      meetingSchedulerEnabled: true,
      meetingSchedulerDefaultDuration: true,
      meetingSchedulerPreferredProvider: true,
      meetingSchedulerWorkingHoursStart: true,
      meetingSchedulerWorkingHoursEnd: true,
      meetingSchedulerAutoCreate: true,
      watchEmailsExpirationDate: true,
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!settings) {
    throw new Error("Email account not found");
  }

  return settings;
}
