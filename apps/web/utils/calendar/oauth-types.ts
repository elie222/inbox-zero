import type { NextResponse } from "next/server";

export interface CalendarTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  email: string;
}

export interface CalendarOAuthProvider {
  name: "google" | "microsoft";

  /**
   * Exchange OAuth code for tokens and get user email
   */
  exchangeCodeForTokens(code: string): Promise<CalendarTokens>;

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
  code: string;
  redirectUrl: URL;
  response: NextResponse;
}

export interface CalendarOAuthState {
  emailAccountId: string;
  type: "calendar";
  nonce: string;
}
