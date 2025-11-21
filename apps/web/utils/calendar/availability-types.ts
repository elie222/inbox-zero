export type BusyPeriod = {
  start: string;
  end: string;
};

export interface CalendarAvailabilityProvider {
  name: "google" | "microsoft";

  /**
   * Fetch busy periods for the given calendars
   */
  fetchBusyPeriods(params: {
    accessToken?: string | null;
    refreshToken: string | null;
    expiresAt: number | null;
    emailAccountId: string;
    calendarIds: string[];
    timeMin: string;
    timeMax: string;
  }): Promise<BusyPeriod[]>;
}
