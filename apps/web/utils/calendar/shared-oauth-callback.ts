import type { NextRequest } from "next/server";
import { CALENDAR_STATE_COOKIE_NAME } from "./constants";
import { validateSignedOAuthState } from "@/utils/oauth/state";

export function isGoogleCalendarCallback(request: NextRequest) {
  const validation = validateSignedOAuthState<{ type?: string }>({
    receivedState: request.nextUrl.searchParams.get("state"),
    storedState: request.cookies.get(CALENDAR_STATE_COOKIE_NAME)?.value,
  });
  return validation.success && validation.state.type === "calendar";
}
