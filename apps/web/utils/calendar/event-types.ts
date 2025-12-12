export interface CalendarEventAttendee {
  email: string;
  name?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  eventUrl?: string;
  videoConferenceLink?: string;
  startTime: Date;
  endTime: Date;
  attendees: CalendarEventAttendee[];
}

export interface CalendarEventProvider {
  fetchEventsWithAttendee(options: {
    attendeeEmail: string;
    timeMin: Date;
    timeMax: Date;
    maxResults: number;
  }): Promise<CalendarEvent[]>;

  fetchEvents(options: {
    timeMin?: Date;
    timeMax?: Date;
    maxResults?: number;
  }): Promise<CalendarEvent[]>;
}
