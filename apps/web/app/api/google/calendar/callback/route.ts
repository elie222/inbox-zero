import { withError } from "@/utils/middleware";
import { handleCalendarCallback } from "@/utils/calendar/handle-calendar-callback";
import { googleCalendarProvider } from "@/utils/calendar/providers/google";

export const GET = withError("google/calendar/callback", async (request) => {
  return handleCalendarCallback(
    request,
    googleCalendarProvider,
    request.logger,
  );
});
