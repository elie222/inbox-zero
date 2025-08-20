import useSWR from "swr";
import type { GetSetupProgressResponse } from "@/app/api/user/setup-progress/route";

export function useSetupProgress() {
  return useSWR<GetSetupProgressResponse>("/api/user/setup-progress");
}
