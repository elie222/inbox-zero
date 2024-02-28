import { ThreadsResponse } from "@/app/api/google/threads/controller";

export type Thread = ThreadsResponse["threads"][number];

export type Executing = Record<string, boolean>;
