import useSWR from "swr";
import type {
  ThreadQuery,
  ThreadResponse,
} from "@/app/api/google/threads/[id]/route";

export function useThread(
  { id }: ThreadQuery,
  options?: { includeDrafts?: boolean },
) {
  const searchParams = new URLSearchParams();
  if (options?.includeDrafts) searchParams.set("includeDrafts", "true");
  console.log("TEST LOG 7");
  const url = `/api/google/threads/${id}?${searchParams.toString()}`;
  return useSWR<ThreadResponse>(url);
}
