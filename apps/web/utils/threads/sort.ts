import { internalDateToDate } from "@/utils/date";

/** Undated threads collapse to 0 so they sort to the end of a list. */
export function getThreadTimestamp(thread: {
  messages: Array<{ internalDate?: string | null }>;
}) {
  return (
    internalDateToDate(thread.messages.at(-1)?.internalDate, {
      fallbackToNow: false,
    }).getTime() || 0
  );
}
