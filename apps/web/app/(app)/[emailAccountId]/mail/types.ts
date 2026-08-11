import type { ThreadsListResponse } from "@/app/api/threads/route";

export type ListThread = ThreadsListResponse["threads"][number];
export type ListMessage = ListThread["messages"][number];

/** One rule that fired on a thread, with the reason it matched. */
export type ThreadPlan = NonNullable<ListThread["plans"]>[number];

/** Split view is the two-column list + reader; list view gives the list the full width. */
export type MailLayoutMode = "list" | "split";
