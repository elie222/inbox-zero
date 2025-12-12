import { render } from "@react-email/render";
import { format } from "date-fns";
import { env } from "@/env";
import { createEmailProvider } from "@/utils/email/provider";
import { sendMeetingBriefingEmail } from "@inboxzero/resend";
import MeetingBriefingEmail, {
  generateMeetingBriefingSubject,
  type MeetingBriefingEmailProps,
} from "@inboxzero/resend/emails/meeting-briefing";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { Logger } from "@/utils/logger";

const FROM_EMAIL = "Inbox Zero <briefs@mail.getinboxzero.com>";

export async function sendBriefingEmail({
  event,
  briefingContent,
  guestCount,
  emailAccountId,
  userEmail,
  provider,
  logger,
}: {
  event: CalendarEvent;
  briefingContent: string;
  guestCount: number;
  emailAccountId: string;
  userEmail: string;
  provider: string;
  logger: Logger;
}): Promise<void> {
  const log = logger.with({ emailAccountId, eventId: event.id, userEmail });

  const formattedDate = format(event.startTime, "EEEE, MMMM d");
  const formattedTime = format(event.startTime, "h:mm a");

  const emailProps: MeetingBriefingEmailProps = {
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
    emailAccountId,
    meetingTitle: event.title,
    formattedDate,
    formattedTime,
    videoConferenceLink: event.videoConferenceLink ?? "",
    eventUrl: event.eventUrl ?? "",
    briefingContent,
    guestCount,
  };

  // Try Resend first if configured
  if (env.RESEND_API_KEY) {
    log.info("Sending briefing via Resend");
    try {
      await sendMeetingBriefingEmail({
        from: FROM_EMAIL,
        to: userEmail,
        emailProps,
      });
      log.info("Briefing sent successfully via Resend");
      return;
    } catch (error) {
      log.error("Failed to send via Resend, falling back to self-send", {
        error,
      });
    }
  }

  // Fallback: Send via user's own email provider
  log.info("Sending briefing via user's email provider");
  await sendViaSelfEmail({
    emailProps,
    emailAccountId,
    userEmail,
    provider,
    log,
  });
}

async function sendViaSelfEmail({
  emailProps,
  emailAccountId,
  userEmail,
  provider,
  log,
}: {
  emailProps: MeetingBriefingEmailProps;
  emailAccountId: string;
  userEmail: string;
  provider: string;
  log: Logger;
}): Promise<void> {
  try {
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
    });

    const subject = generateMeetingBriefingSubject(emailProps);
    const htmlContent = await render(MeetingBriefingEmail(emailProps));

    await emailProvider.sendEmailWithHtml({
      to: userEmail,
      subject,
      messageHtml: htmlContent,
    });

    log.info("Briefing sent successfully via self-email");
  } catch (error) {
    log.error("Failed to send briefing via self-email", { error });
    throw error;
  }
}
