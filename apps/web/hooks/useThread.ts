import useSWR from "swr";
import type { ThreadQuery, ThreadResponse } from "@/app/api/threads/[id]/route";

export function useThread(
  { id }: ThreadQuery,
  options?: { includeDrafts?: boolean },
) {
  const searchParams = new URLSearchParams();
  if (options?.includeDrafts) searchParams.set("includeDrafts", "true");
  const url = `/api/threads/${id}?${searchParams.toString()}`;
  return useSWR<ThreadResponse>(url);
}
