import { createScopedLogger } from "@/utils/logger";
import { getCalendarClientWithRefresh } from "@/utils/outlook/calendar-client";
import type { MeetingLinkResult } from "./types";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("meetings/providers/teams");

export interface TeamsMeetingOptions {
  emailAccountId: string;
  subject: string;
  startDateTime: Date;
  endDateTime: string;
}

/**
 * Create a Microsoft Teams meeting link
 * Requires Microsoft Graph API access with OnlineMeetings.ReadWrite scope
 */
export async function createTeamsMeeting(
  options: TeamsMeetingOptions,
): Promise<MeetingLinkResult> {
  const { emailAccountId, subject, startDateTime, endDateTime } = options;

  logger.info("Creating Teams meeting", {
    emailAccountId,
    subject,
  });

  // Get calendar connection to access Microsoft Graph
  const calendarConnection = await prisma.calendarConnection.findFirst({
    where: {
      emailAccountId,
      provider: "microsoft",
      isConnected: true,
    },
    select: {
      accessToken: true,
      refreshToken: true,
      expiresAt: true,
    },
  });

  if (!calendarConnection) {
    throw new Error("No Microsoft calendar connection found for this account");
  }

  // Get authenticated client with auto-refresh
  const client = await getCalendarClientWithRefresh({
    accessToken: calendarConnection.accessToken,
    refreshToken: calendarConnection.refreshToken,
    expiresAt: calendarConnection.expiresAt?.getTime() || null,
    emailAccountId,
  });

  try {
    // Create online meeting via Graph API
    // https://learn.microsoft.com/en-us/graph/api/application-post-onlinemeetings
    const meeting = await client.api("/me/onlineMeetings").post({
      startDateTime,
      endDateTime,
      subject,
    });

    logger.info("Teams meeting created", {
      meetingId: meeting.id,
      joinUrl: meeting.joinWebUrl,
    });

    return {
      provider: "teams",
      joinUrl: meeting.joinWebUrl,
      conferenceId: meeting.id,
      conferenceData: {
        // Data to attach to calendar event
        onlineMeeting: {
          joinUrl: meeting.joinWebUrl,
          conferenceId: meeting.id,
        },
        isOnlineMeeting: true,
        onlineMeetingProvider: "teamsForBusiness",
      },
    };
  } catch (error) {
    logger.error("Failed to create Teams meeting", { error });
    throw new Error(
      `Failed to create Teams meeting: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}
