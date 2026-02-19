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
import { sendMeetingBriefingToSlack } from "@inboxzero/slack";
import { MessagingProvider } from "@/generated/prisma/enums";
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { Logger } from "@/utils/logger";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { formatTimeInUserTimezone } from "@/utils/date";
import prisma from "@/utils/prisma";

export async function sendBriefing({
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

  const briefingContentWithTeam: BriefingContent = {
    ...briefingContent,
    internalTeamMembers,
  };

  // Fetch delivery preferences
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { meetingBriefsSendEmail: true },
  });

  const sendEmail = emailAccount?.meetingBriefsSendEmail ?? true;

  // Fetch connected messaging channels with briefs enabled
  const channels = await prisma.messagingChannel.findMany({
    where: {
      emailAccountId,
      isConnected: true,
      sendMeetingBriefs: true,
      channelId: { not: null },
    },
    select: {
      provider: true,
      accessToken: true,
      channelId: true,
    },
  });

  const deliveryPromises: Promise<void>[] = [];

  if (sendEmail) {
    deliveryPromises.push(
      sendBriefingViaEmail({
        event,
        briefingContent: briefingContentWithTeam,
        emailAccountId,
        userEmail,
        provider,
        formattedTime,
        logger,
      }),
    );
  }

  for (const channel of channels) {
    if (!channel.accessToken || !channel.channelId) continue;

    switch (channel.provider) {
      case MessagingProvider.SLACK:
        deliveryPromises.push(
          sendBriefingViaSlack({
            accessToken: channel.accessToken,
            channelId: channel.channelId,
            meetingTitle: event.title,
            formattedTime,
            videoConferenceLink: event.videoConferenceLink ?? undefined,
            eventUrl: event.eventUrl ?? undefined,
            briefingContent: briefingContentWithTeam,
            logger,
          }),
        );
        break;
      case MessagingProvider.WHATSAPP:
      case MessagingProvider.TELEGRAM:
        break;
    }
  }

  if (deliveryPromises.length === 0) {
    logger.info("No delivery channels configured, skipping briefing");
    return;
  }

  const results = await Promise.allSettled(deliveryPromises);
  const failures = results.filter((r) => r.status === "rejected");

  if (failures.length > 0) {
    for (const failure of failures) {
      logger.error("Delivery channel failed", {
        reason: (failure as PromiseRejectedResult).reason,
      });
    }

    if (failures.length === results.length) {
      throw new Error("All delivery channels failed");
    }
  }
}

async function sendBriefingViaEmail({
  event,
  briefingContent,
  emailAccountId,
  userEmail,
  provider,
  formattedTime,
  logger,
}: {
  event: CalendarEvent;
  briefingContent: BriefingContent;
  emailAccountId: string;
  userEmail: string;
  provider: string;
  formattedTime: string;
  logger: Logger;
}): Promise<void> {
  const unsubscribeToken = await createUnsubscribeToken({ emailAccountId });

  const emailProps: MeetingBriefingEmailProps = {
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
    emailAccountId,
    meetingTitle: event.title,
    formattedTime,
    videoConferenceLink: event.videoConferenceLink ?? "",
    eventUrl: event.eventUrl ?? "",
    briefingContent,
    unsubscribeToken,
  };

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

  logger.info("Sending briefing via user's email provider");
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
}

async function sendBriefingViaSlack({
  accessToken,
  channelId,
  meetingTitle,
  formattedTime,
  videoConferenceLink,
  eventUrl,
  briefingContent,
  logger,
}: {
  accessToken: string;
  channelId: string;
  meetingTitle: string;
  formattedTime: string;
  videoConferenceLink?: string;
  eventUrl?: string;
  briefingContent: BriefingContent;
  logger: Logger;
}): Promise<void> {
  logger.info("Sending briefing to Slack");
  await sendMeetingBriefingToSlack({
    accessToken,
    channelId,
    meetingTitle,
    formattedTime,
    videoConferenceLink,
    eventUrl,
    briefingContent,
  });
  logger.info("Briefing sent successfully to Slack");
}
