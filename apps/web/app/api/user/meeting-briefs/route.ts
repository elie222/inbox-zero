import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import {
  getNotificationChannels,
  isNotificationChannelsAvailable,
  CHANNEL_TYPES,
} from "@/utils/pipedream/notification-channels";

export type GetMeetingBriefsSettingsResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount("user/meeting-briefs", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getData({ emailAccountId });
  return NextResponse.json(result);
});

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const [emailAccount, channels] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        meetingBriefingsEnabled: true,
        meetingBriefingsMinutesBefore: true,
      },
    }),
    // Pass false to get all channels (not just enabled) for the settings UI
    getNotificationChannels(emailAccountId, false),
  ]);

  const isPipedreamConfigured = isNotificationChannelsAvailable();

  return {
    enabled: emailAccount?.meetingBriefingsEnabled ?? false,
    minutesBefore: emailAccount?.meetingBriefingsMinutesBefore,
    notificationChannels: channels,
    isPipedreamConfigured,
    availableChannelTypes: Object.entries(CHANNEL_TYPES).map(
      ([key, value]) => ({
        type: key,
        name: value.name,
      }),
    ),
  };
}
