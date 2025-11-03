import type { ThreadsResponse } from "@/app/api/threads/route";

type FullThread = ThreadsResponse["threads"][number];
// defining it explicitly to make it easier to understand the type
export type Thread = {
  id: FullThread["id"];
  messages: FullThread["messages"];
  snippet: FullThread["snippet"];
  plan: FullThread["plan"];
};

export type Executing = Record<string, boolean>;

export type ThreadMessage = Thread["messages"][number];
