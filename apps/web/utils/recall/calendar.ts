import { createScopedLogger } from "@/utils/logger";
import { recallRequest } from "@/utils/recall/request";
import { env } from "@/env";
import type {
  RecallCalendarEventsListResponse,
  RecallCalendarEvent,
} from "@/app/api/recall/webhook/types";

const logger = createScopedLogger("recall/calendar");

export interface RecallCalendar {
  id: string;
  platform: "google_calendar" | "microsoft_outlook";
  status: "connected" | "disconnected" | "error";
  created_at: string;
  updated_at: string;
}

export interface CreateRecallCalendarRequest {
  oauth_refresh_token: string;
}

export interface CreateRecallCalendarResponse {
  id: string;
  platform: string;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Create a calendar in Recall.ai
 */
export async function createRecallCalendar(
  request: CreateRecallCalendarRequest,
): Promise<RecallCalendar> {
  try {
    const requestBody = {
      oauth_client_id: env.GOOGLE_CLIENT_ID,
      oauth_client_secret: env.GOOGLE_CLIENT_SECRET,
      oauth_refresh_token: request.oauth_refresh_token,
      platform: "google_calendar",
    };

    const data = await recallRequest<CreateRecallCalendarResponse>(
      "/api/v2/calendars",
      {
        method: "POST",
        body: JSON.stringify(requestBody),
      },
    );

    logger.info("Created calendar in Recall", {
      recallCalendarId: data.id,
      platform: "google_calendar",
      status: data.status,
    });

    return {
      id: data.id,
      platform: "google_calendar",
      status: data.status as "connected" | "disconnected" | "error",
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error) {
    logger.error("Failed to create calendar in Recall", {
      error,
      platform: "google_calendar",
    });
    throw error;
  }
}

/**
 * Get calendar details from Recall.ai
 */
export async function getRecallCalendar(
  recallCalendarId: string,
): Promise<RecallCalendar | null> {
  try {
    const data = await recallRequest<CreateRecallCalendarResponse>(
      `/api/v2/calendars/${recallCalendarId}`,
    );

    return {
      id: data.id,
      platform: data.platform as "google_calendar" | "microsoft_outlook",
      status: data.status as "connected" | "disconnected" | "error",
      created_at: data.created_at,
      updated_at: data.updated_at,
    };
  } catch (error) {
    // Handle 404 as null (calendar doesn't exist)
    if (error instanceof Error && error.message.includes("404")) {
      return null;
    }
    logger.error("Failed to get calendar from Recall", {
      error,
      recallCalendarId,
    });
    throw error;
  }
}

/**
 * Delete a calendar from Recall.ai
 */
export async function deleteRecallCalendar(
  recallCalendarId: string,
): Promise<void> {
  try {
    await recallRequest(`/api/v2/calendars/${recallCalendarId}`, {
      method: "DELETE",
    });

    logger.info("Deleted calendar from Recall", {
      recallCalendarId,
    });
  } catch (error) {
    logger.error("Failed to delete calendar from Recall", {
      error,
      recallCalendarId,
    });
    throw error;
  }
}

export async function fetchCalendarEvents(
  recallCalendarId: string,
  lastUpdatedTs?: string,
): Promise<RecallCalendarEventsListResponse> {
  const allResults: RecallCalendarEvent[] = [];
  let nextUrl: string | null = null;
  let currentResponse: RecallCalendarEventsListResponse;

  currentResponse = await recallRequest<RecallCalendarEventsListResponse>(
    "/api/v2/calendar-events",
    {
      params: {
        calendar_id: recallCalendarId,
        ...(lastUpdatedTs ? { updated_at_gte: lastUpdatedTs } : {}),
      },
    },
  );

  allResults.push(...currentResponse.results);
  nextUrl = currentResponse.next;

  while (nextUrl) {
    const nextUrlObj = new URL(nextUrl);
    const endpoint = nextUrlObj.pathname + nextUrlObj.search;

    currentResponse = await recallRequest<RecallCalendarEventsListResponse>(
      endpoint,
      {
        method: "GET",
      },
    );

    allResults.push(...currentResponse.results);
    nextUrl = currentResponse.next;
  }

  return {
    results: allResults,
    next: null,
    previous: currentResponse.previous,
  };
}
