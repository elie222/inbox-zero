import type { BookingLinkLocationType } from "@/generated/prisma/enums";

export interface CalendarEventAttendee {
  email: string;
  name?: string;
}

export interface CalendarEvent {
  attendees: CalendarEventAttendee[];
  description?: string;
  endTime: Date;
  eventUrl?: string;
  id: string;
  location?: string;
  startTime: Date;
  title: string;
  videoConferenceLink?: string;
}

export interface CalendarEventWriteInput {
  attendees: CalendarEventAttendee[];
  calendarId: string;
  description?: string;
  endTime: Date;
  locationType: BookingLinkLocationType;
  locationValue?: string | null;
  startTime: Date;
  timezone: string;
  title: string;
}

export interface CalendarEventWriteResult {
  eventUrl?: string;
  id: string;
  providerCalendarId: string;
  videoConferenceLink?: string;
}

export interface CalendarEventCancelInput {
  calendarId: string;
  eventId: string;
}

export interface CalendarEventProvider {
  fetchEvents(options: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
  }): Promise<CalendarEvent[]>;
  fetchEventsWithAttendee(options: {
    attendeeEmail: string;
    timeMin: Date;
    timeMax: Date;
    maxResults: number;
  }): Promise<CalendarEvent[]>;
}
