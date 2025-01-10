import useSWR from "swr";
import type {
  ThreadQuery,
  ThreadResponse,
} from "@/app/api/google/threads/[id]/route";

export function useThread({ id }: ThreadQuery) {
  const url = `/api/google/threads/${id}`;
  return useSWR<ThreadResponse>(url);
}
