import { withError } from "@/utils/middleware";
import { handleCalendarCallback } from "@/utils/calendar/handle-calendar-callback";
import { createMicrosoftCalendarProvider } from "@/utils/calendar/providers/microsoft";

export const GET = withError("outlook/calendar/callback", async (request) => {
  return handleCalendarCallback(
    request,
    createMicrosoftCalendarProvider(request.logger),
    request.logger,
  );
});
