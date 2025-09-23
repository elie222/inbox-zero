export interface CalendarUpdateEvent {
  event: "calendar.update";
  data: {
    calendar_id: string;
  };
}

export interface CalendarSyncEventsEvent {
  event: "calendar.sync_events";
  data: {
    calendar_id: string;
    last_updated_ts: string;
  };
}

export interface RecordingDoneEvent {
  event: "recording.done";
  data: {
    data: {
      code: string;
      sub_code: string | null;
      updated_at: string;
    };
    recording: {
      id: string;
      metadata: object;
    };
    bot: {
      id: string;
      metadata: object;
    } | null;
  };
}

export interface TranscriptDoneEvent {
  event: "transcript.done";
  data: {
    data: {
      code: string;
      sub_code: string | null;
      updated_at: string;
    };
    bot: {
      id: string;
      metadata: object;
    };
    transcript: {
      id: string;
      metadata: object;
    };
    recording: {
      id: string;
      metadata: object;
    };
  };
}

export type RecallWebhookPayload =
  | CalendarUpdateEvent
  | CalendarSyncEventsEvent
  | RecordingDoneEvent
  | TranscriptDoneEvent;

export interface RecallBotInfo {
  bot_id: string;
  start_time: string;
  deduplication_key: string;
  meeting_url: string;
}

export interface RecallCalendarEvent {
  id: string;
  start_time: string;
  end_time: string | null;
  calendar_id: string;
  meeting_url: string | null;
  title?: string | null;
  is_deleted: boolean;
  updated_at?: string;
  platform?: string;
  platform_id?: string;
  ical_uid?: string | null;
  bots?: RecallBotInfo[];
  raw?: unknown;
}

export interface RecallCalendarEventsListResponse {
  results: RecallCalendarEvent[];
}

export interface TranscriptMetadataResponse {
  data: { download_url: string } | null;
  id: string;
  status: { code: string };
}

export interface TranscriptWord {
  text: string;
}
export interface TranscriptParticipant {
  name?: string;
}
export interface TranscriptSegment {
  participant?: TranscriptParticipant;
  words?: TranscriptWord[];
}

export type TranscriptContent =
  | string
  | TranscriptSegment[]
  | {
      transcript?: string;
      content?: string;
      [key: string]: string | null | undefined;
    };

export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  meeting_url?: string;
  participants?: string[];
}

export interface RecallBot {
  id: string;
  meeting_url: string;
  join_at: string;
  bot_name?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface RecallCalendarEventResponse {
  event: RecallCalendarEvent;
  bots: RecallBotInfo[];
}
