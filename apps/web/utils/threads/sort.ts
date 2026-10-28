import { internalDateToDate } from "@/utils/date";

/**
 * A thread is as recent as its newest message. Providers hand back thread
 * messages in their own order, so the position in the array means nothing.
 * Undated threads collapse to 0 so they sort to the end of a list.
 */
export function getThreadTimestamp(thread: {
  messages: Array<{ internalDate?: string | null }>;
}) {
  let newest = 0;
  for (const message of thread.messages) {
    const timestamp =
      internalDateToDate(message.internalDate, {
        fallbackToNow: false,
      }).getTime() || 0;
    if (timestamp > newest) newest = timestamp;
  }
  return newest;
}
