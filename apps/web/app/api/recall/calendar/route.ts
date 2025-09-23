import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import {
  createRecallCalendar,
  getRecallCalendar,
  deleteRecallCalendar,
} from "@/utils/recall/calendar";
import { createScopedLogger } from "@/utils/logger";
import { withEmailAccount } from "@/utils/middleware";

const logger = createScopedLogger("recall/calendar");

export type CreateRecallCalendarResponse = Awaited<
  ReturnType<typeof createRecallCalendarForConnection>
>;

export const POST = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await createRecallCalendarForConnection({ emailAccountId });
  return NextResponse.json(result);
});

export const DELETE = withEmailAccount(async (request) => {
  const { emailAccountId } = request.auth;

  const result = await deleteRecallCalendarForConnection({ emailAccountId });
  return NextResponse.json(result);
});

async function createRecallCalendarForConnection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  // Get the primary calendar connection for this email account
  const connection = await prisma.calendarConnection.findFirst({
    where: {
      emailAccountId,
      isConnected: true,
    },
    include: {
      calendars: {
        where: {
          isEnabled: true,
          primary: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc", // Get the most recent connection
    },
  });

  if (!connection) {
    throw new Error("No connected calendar found for this email account");
  }

  if (connection.calendars.length === 0) {
    throw new Error("No enabled primary calendar found");
  }

  // Check if we already have a Recall calendar for this connection
  if (connection.recallCalendarId) {
    // Verify the calendar still exists in Recall
    const recallCalendar = await getRecallCalendar(connection.recallCalendarId);
    if (recallCalendar) {
      logger.info("Recall calendar already exists", {
        recallCalendarId: connection.recallCalendarId,
        status: recallCalendar.status,
      });
      return {
        recallCalendarId: connection.recallCalendarId,
        status: recallCalendar.status,
      };
    } else {
      // Calendar was deleted from Recall, remove the reference
      await prisma.calendarConnection.update({
        where: { id: connection.id },
        data: { recallCalendarId: null },
      });
    }
  }

  // Map provider to Recall platform
  const platform =
    connection.provider === "google" ? "google_calendar" : "microsoft_outlook";

  // Get OAuth client credentials based on provider
  const oauthClientId =
    connection.provider === "google"
      ? process.env.GOOGLE_CLIENT_ID
      : process.env.MICROSOFT_CLIENT_ID;
  const oauthClientSecret =
    connection.provider === "google"
      ? process.env.GOOGLE_CLIENT_SECRET
      : process.env.MICROSOFT_CLIENT_SECRET;

  if (!oauthClientId || !oauthClientSecret) {
    throw new Error(`Missing OAuth credentials for ${connection.provider}`);
  }

  if (!connection.refreshToken) {
    throw new Error("No refresh token available for calendar connection");
  }

  // Create calendar in Recall
  const recallCalendar = await createRecallCalendar({
    oauth_client_id: oauthClientId,
    oauth_client_secret: oauthClientSecret,
    oauth_refresh_token: connection.refreshToken,
    platform,
  });

  // Update the connection with the Recall calendar ID
  await prisma.calendarConnection.update({
    where: { id: connection.id },
    data: { recallCalendarId: recallCalendar.id },
  });

  logger.info("Successfully created and linked Recall calendar", {
    emailAccountId,
    connectionId: connection.id,
    recallCalendarId: recallCalendar.id,
    platform,
  });

  return {
    recallCalendarId: recallCalendar.id,
    status: recallCalendar.status,
    platform: recallCalendar.platform,
  };
}

async function deleteRecallCalendarForConnection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  // Find calendar connections with Recall calendar IDs for this email account
  const connections = await prisma.calendarConnection.findMany({
    where: {
      emailAccountId,
      recallCalendarId: { not: null },
    },
  });

  const results = [];

  for (const connection of connections) {
    if (!connection.recallCalendarId) continue;

    try {
      await deleteRecallCalendar(connection.recallCalendarId);

      // Remove the Recall calendar ID from our database
      await prisma.calendarConnection.update({
        where: { id: connection.id },
        data: { recallCalendarId: null },
      });

      results.push({
        connectionId: connection.id,
        recallCalendarId: connection.recallCalendarId,
        status: "deleted",
      });

      logger.info("Successfully deleted Recall calendar", {
        connectionId: connection.id,
        recallCalendarId: connection.recallCalendarId,
      });
    } catch (error) {
      logger.error("Failed to delete Recall calendar", {
        error: error instanceof Error ? error.message : error,
        connectionId: connection.id,
        recallCalendarId: connection.recallCalendarId,
      });

      results.push({
        connectionId: connection.id,
        recallCalendarId: connection.recallCalendarId,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { results };
}
