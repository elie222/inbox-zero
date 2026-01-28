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
import type { CalendarEvent } from "@/utils/calendar/event-types";
import type { Logger } from "@/utils/logger";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { formatTimeInUserTimezone } from "@/utils/date";
import prisma from "@/utils/prisma";

type SendBriefingParams = {
  event: CalendarEvent;
  briefingContent: BriefingContent;
  internalTeamMembers: InternalTeamMember[];
  emailAccountId: string;
  userEmail: string;
  provider: string;
  userTimezone: string | null;
  logger: Logger;
};

export async function sendBriefing(params: SendBriefingParams): Promise<void> {
  const { emailAccountId, logger } = params;

  const deliverySettings = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      meetingBriefsSendEmail: true,
      meetingBriefsSendSlack: true,
      slackConnections: {
        where: { isConnected: true, channelId: { not: null } },
        take: 1,
        select: {
          accessToken: true,
          channelId: true,
        },
      },
    },
  });

  if (!deliverySettings) {
    logger.error("Email account not found for delivery settings");
    return;
  }

  const { meetingBriefsSendEmail, meetingBriefsSendSlack, slackConnections } =
    deliverySettings;
  const slackConnection = slackConnections[0];

  const deliveryPromises: Promise<void>[] = [];

  if (meetingBriefsSendEmail) {
    deliveryPromises.push(sendBriefingEmail(params));
  }

  if (meetingBriefsSendSlack && slackConnection?.channelId) {
    deliveryPromises.push(
      sendBriefingSlack({
        ...params,
        accessToken: slackConnection.accessToken,
        channelId: slackConnection.channelId,
      }),
    );
  }

  if (deliveryPromises.length === 0) {
    logger.warn("No delivery channels enabled for meeting briefs");
    deliveryPromises.push(sendBriefingEmail(params));
  }

  const results = await Promise.allSettled(deliveryPromises);

  for (const result of results) {
    if (result.status === "rejected") {
      logger.error("Delivery channel failed", { error: result.reason });
    }
  }

  const allFailed = results.every((r) => r.status === "rejected");
  if (allFailed) {
    throw new Error("All delivery channels failed");
  }
}

async function sendBriefingEmail({
  event,
  briefingContent,
  internalTeamMembers,
  emailAccountId,
  userEmail,
  provider,
  userTimezone,
  logger,
}: SendBriefingParams): Promise<void> {
  logger = logger.with({ emailAccountId, eventId: event.id, userEmail });

  const formattedTime = formatTimeInUserTimezone(event.startTime, userTimezone);

  const unsubscribeToken = await createUnsubscribeToken({ emailAccountId });

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
  await sendViaSelfEmail({
    emailProps,
    emailAccountId,
    userEmail,
    provider,
    logger,
  });
}

async function sendBriefingSlack({
  event,
  briefingContent,
  internalTeamMembers,
  userTimezone,
  logger,
  accessToken,
  channelId,
}: SendBriefingParams & {
  accessToken: string;
  channelId: string;
}): Promise<void> {
  logger.info("Sending briefing via Slack");

  const formattedTime = formatTimeInUserTimezone(event.startTime, userTimezone);

  const briefingContentWithTeam: BriefingContent = {
    ...briefingContent,
    internalTeamMembers,
  };

  try {
    await sendMeetingBriefingToSlack({
      accessToken,
      channelId,
      meetingTitle: event.title,
      formattedTime,
      videoConferenceLink: event.videoConferenceLink,
      eventUrl: event.eventUrl,
      briefingContent: briefingContentWithTeam,
    });
    logger.info("Briefing sent successfully via Slack");
  } catch (error) {
    logger.error("Failed to send briefing via Slack", { error });
    throw error;
  }
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
