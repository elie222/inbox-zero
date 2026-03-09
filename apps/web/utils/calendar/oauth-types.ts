import type { NextResponse } from "next/server";

export interface CalendarTokens {
  accessToken: string;
  email: string;
  expiresAt: Date | null;
  refreshToken: string;
}

export interface CalendarOAuthProvider {
  /**
   * Exchange OAuth code for tokens and get user email
   */
  exchangeCodeForTokens(code: string): Promise<CalendarTokens>;
  name: "google" | "microsoft";

  /**
   * Sync calendars for this provider
   */
  syncCalendars(
    connectionId: string,
    accessToken: string,
    refreshToken: string,
    emailAccountId: string,
    expiresAt: Date | null,
  ): Promise<void>;
}

export interface OAuthCallbackValidation {
  calendarState: CalendarOAuthState;
  code: string;
  redirectUrl: URL;
  response: NextResponse;
}

export interface CalendarOAuthState {
  emailAccountId: string;
  nonce: string;
  type: "calendar";
}
