import { withError } from "@/utils/middleware";
import { handleCalendarCallback } from "@/utils/calendar/handle-calendar-callback";
import { microsoftCalendarProvider } from "@/utils/calendar/providers/microsoft";

export const GET = withError("outlook/calendar/callback", async (request) => {
  return handleCalendarCallback(
    request,
    microsoftCalendarProvider,
    request.logger,
  );
});
