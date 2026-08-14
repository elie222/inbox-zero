import type { CombinedListThread } from "@/utils/threads/load-combined";
import type { ThreadListItem } from "@/utils/threads/load";

export type ListThread = ThreadListItem | CombinedListThread;
export type ListMessage = ListThread["messages"][number];

/** One rule that fired on a thread, with the reason it matched. */
export type ThreadPlan = NonNullable<ListThread["plans"]>[number];

/** Split view is the two-column list + reader; list view gives the list the full width. */
export type MailLayoutMode = "list" | "split";

export function getListThreadKey(thread: ListThread) {
  return "account" in thread ? `${thread.account.id}:${thread.id}` : thread.id;
}
