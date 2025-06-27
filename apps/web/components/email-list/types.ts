import type { ThreadsResponse as GmailThreadsResponse } from "@/app/api/google/threads/controller";
import type { ThreadsResponse as MicrosoftThreadsResponse } from "@/app/api/microsoft/threads/controller";

type FullThread =
  | GmailThreadsResponse["threads"][number]
  | MicrosoftThreadsResponse["threads"][number];
// defining it explicitly to make it easier to understand the type
export type Thread = {
  id: FullThread["id"];
  messages: FullThread["messages"];
  snippet: FullThread["snippet"];
  plan: FullThread["plan"];
  category: FullThread["category"];
};

export type Executing = Record<string, boolean>;

export type ThreadMessage = Thread["messages"][number];
