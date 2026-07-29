import { render } from "@react-email/render";
import { sendMeetingRecapEmail as sendViaResend } from "@inboxzero/resend";
import MeetingRecapEmail, {
  generateMeetingRecapSubject,
  type MeetingRecapEmailProps,
} from "@inboxzero/resend/emails/meeting-recap";
import { env } from "@/env";
import type { MeetingSummary } from "@/utils/ai/meeting-recorder/summarize-meeting";
import { formatDateTimeInUserTimezone } from "@/utils/date";
import { createEmailProvider } from "@/utils/email/provider";
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

  if (env.RESEND_API_KEY) {
    try {
      await sendViaResend({
        from: env.RESEND_FROM_EMAIL,
        to: userEmail,
        emailProps,
      });
      logger.info("Sent meeting recap via Resend");
      return;
    } catch (error) {
      logger.error(
        "Failed to send recap via Resend, falling back to self-send",
        {
          error,
        },
      );
    }
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  await emailProvider.sendEmailWithHtml({
    to: userEmail,
    subject: generateMeetingRecapSubject(emailProps),
    messageHtml: await render(MeetingRecapEmail(emailProps)),
  });

  logger.info("Sent meeting recap via the user's own mailbox");
}
