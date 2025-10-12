import { z } from "zod";

export const disconnectCalendarBody = z.object({
  connectionId: z.string(),
});
export type DisconnectCalendarBody = z.infer<typeof disconnectCalendarBody>;

export const toggleCalendarBody = z.object({
  calendarId: z.string(),
  isEnabled: z.boolean(),
});
export type ToggleCalendarBody = z.infer<typeof toggleCalendarBody>;
