import { internalDateToDate } from "@/utils/date";
import type { ThreadListItem } from "@/utils/threads/load";

export function getThreadTimestamp(thread: Pick<ThreadListItem, "messages">) {
  return (
    internalDateToDate(thread.messages.at(-1)?.internalDate, {
      fallbackToNow: false,
    }).getTime() || 0
  );
}
