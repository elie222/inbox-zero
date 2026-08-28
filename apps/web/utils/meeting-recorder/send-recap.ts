import { render } from "@react-email/render";
import { sendMeetingRecapEmail as sendViaResend } from "@inboxzero/transactional-email";
import MeetingRecapEmail, {
  generateMeetingRecapSubject,
  type MeetingRecapEmailProps,
} from "@inboxzero/transactional-email/emails/meeting-recap";
import { env } from "@/env";
import type { MeetingSummary } from "@/utils/ai/meeting-recorder/summarize-meeting";
import { formatDateTimeInUserTimezone } from "@/utils/date";
import { sendNotificationEmail } from "@/utils/email/send-notification-email";
import type { Logger } from "@/utils/logger";
import { createUnsubscribeToken } from "@/utils/unsubscribe";

export async function sendMeetingRecapEmail({
  emailAccountId,
  userEmail,
  provider,
  timezone,
  meetingTitle,
  startTime,
  summary,
  followUpDraftCreated,
  logger,
}: {
  emailAccountId: string;
  userEmail: string;
  provider: string;
  timezone: string | null;
  meetingTitle: string;
  startTime: Date;
  summary: MeetingSummary;
  followUpDraftCreated: boolean;
  logger: Logger;
}): Promise<void> {
  const unsubscribeToken = await createUnsubscribeToken({
    emailAccountId,
    action: "meeting-recorder-recap",
  });

  const emailProps: MeetingRecapEmailProps = {
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
    emailAccountId,
    meetingTitle,
    formattedTime: formatDateTimeInUserTimezone(startTime, timezone),
    recap: summary,
    followUpDraftCreated,
    unsubscribeToken,
  };

  await sendNotificationEmail({
    emailAccountId,
    userEmail,
    provider,
    subject: generateMeetingRecapSubject(emailProps),
    sendViaResend: () =>
      sendViaResend({
        from: env.RESEND_FROM_EMAIL,
        to: userEmail,
        emailProps,
      }),
    renderHtml: () => render(MeetingRecapEmail(emailProps)),
    logger,
  });
}
