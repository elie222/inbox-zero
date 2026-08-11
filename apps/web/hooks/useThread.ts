import useSWR from "swr";
import type { ThreadResponse } from "@/app/api/threads/[id]/route";

// `id` accepts null so "no thread open" is expressible in the type rather than
// as a magic empty string that would silently resolve to the thread list route.
export function useThread(
  { id }: { id: string | null },
  options?: { includeDrafts?: boolean },
) {
  const searchParams = new URLSearchParams();
  if (options?.includeDrafts) searchParams.set("includeDrafts", "true");
  // An empty id would resolve to the thread *list* route and quietly fetch every
  // thread with full message bodies, so skip the request instead.
  const url = id ? `/api/threads/${id}?${searchParams.toString()}` : null;
  return useSWR<ThreadResponse>(url);
}
