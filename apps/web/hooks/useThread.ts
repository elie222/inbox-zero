import useSWR from "swr";
import type { ThreadQuery, ThreadResponse } from "@/app/api/threads/[id]/route";

export function useThread(
  { id }: ThreadQuery,
  options?: { includeDrafts?: boolean },
) {
  const searchParams = new URLSearchParams();
  if (options?.includeDrafts) searchParams.set("includeDrafts", "true");
  // An empty id would resolve to the thread *list* route and quietly fetch every
  // thread with full message bodies, so skip the request instead.
  const url = id ? `/api/threads/${id}?${searchParams.toString()}` : null;
  return useSWR<ThreadResponse>(url);
}
