import { render } from "@react-email/render";
import { env } from "@/env";
import { createEmailProvider } from "@/utils/email/provider";
import { sendMeetingBriefingEmail } from "@inboxzero/resend";
import MeetingBriefingEmail, {
  generateMeetingBriefingSubject,
  type MeetingBriefingEmailProps,
  type BriefingContent,
  type InternalTeamMember,
} from "@inboxzero/resend/emails/meeting-briefing";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { Logger } from "@/utils/logger";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { formatTimeInUserTimezone } from "@/utils/date";

export async function sendBriefingEmail({
  event,
  briefingContent,
  internalTeamMembers,
  emailAccountId,
  userEmail,
  provider,
  userTimezone,
  logger,
}: {
  event: CalendarEvent;
  briefingContent: BriefingContent;
  internalTeamMembers: InternalTeamMember[];
  emailAccountId: string;
  userEmail: string;
  provider: string;
  userTimezone: string | null;
  logger: Logger;
}): Promise<void> {
  logger = logger.with({ emailAccountId, eventId: event.id, userEmail });

  const formattedTime = formatTimeInUserTimezone(event.startTime, userTimezone);

  const unsubscribeToken = await createUnsubscribeToken({ emailAccountId });

  // Merge internal team members into briefing content for the email
  const briefingContentWithTeam: BriefingContent = {
    ...briefingContent,
    internalTeamMembers,
  };

  const emailProps: MeetingBriefingEmailProps = {
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
    emailAccountId,
    meetingTitle: event.title,
    formattedTime,
    videoConferenceLink: event.videoConferenceLink ?? "",
    eventUrl: event.eventUrl ?? "",
    briefingContent: briefingContentWithTeam,
    unsubscribeToken,
  };

  // Try Resend first if configured
  if (env.RESEND_API_KEY) {
    logger.info("Sending briefing via Resend");
    try {
      await sendMeetingBriefingEmail({
        from: env.RESEND_FROM_EMAIL,
        to: userEmail,
        emailProps,
      });
      logger.info("Briefing sent successfully via Resend");
      return;
    } catch (error) {
      logger.error("Failed to send via Resend, falling back to self-send", {
        error,
      });
    }
  }

  // Fallback: Send via user's own email provider
  logger.info("Sending briefing via user's email provider");
  await sendViaSelfEmail({
    emailProps,
    emailAccountId,
    userEmail,
    provider,
    logger,
  });
}

async function sendViaSelfEmail({
  emailProps,
  emailAccountId,
  userEmail,
  provider,
  logger,
}: {
  emailProps: MeetingBriefingEmailProps;
  emailAccountId: string;
  userEmail: string;
  provider: string;
  logger: Logger;
}): Promise<void> {
  try {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });

    const subject = generateMeetingBriefingSubject(emailProps);
    const htmlContent = await render(MeetingBriefingEmail(emailProps));

    await emailProvider.sendEmailWithHtml({
      to: userEmail,
      subject,
      messageHtml: htmlContent,
    });

    logger.info("Briefing sent successfully via self-email");
  } catch (error) {
    logger.error("Failed to send briefing via self-email", { error });
    throw error;
  }
}
