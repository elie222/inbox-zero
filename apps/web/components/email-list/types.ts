import { ThreadsResponse } from "@/app/api/google/threads/route";

export type Thread = ThreadsResponse["threads"][number];

export type Executing = Record<string, boolean>;
