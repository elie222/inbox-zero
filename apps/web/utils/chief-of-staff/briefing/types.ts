export interface CalendarEvent {
  calendarName: string;
  end: string;
  start: string;
  summary: string;
}

export interface GmailThread {
  date: string;
  from: string;
  query: string;
  snippet: string;
  subject: string;
}

export interface WeatherData {
  currentTemp: number;
  description: string;
  highTemp: number;
  lowTemp: number;
  precipitation: number;
}

export interface GatheredData {
  calendar:
    | { status: "ok"; events: CalendarEvent[] }
    | { status: "failed"; error: string };
  generatedAt: string;
  gmail:
    | { status: "ok"; threads: GmailThread[] }
    | { status: "failed"; error: string };
  weather:
    | { status: "ok"; data: WeatherData }
    | { status: "failed"; error: string };
}
