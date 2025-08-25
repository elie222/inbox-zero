import type { GetSetupProgressResponse } from "@/app/api/user/setup-progress/route";
import { useSWRWithEmailAccount } from "@/utils/swr";

export function useSetupProgress() {
  return useSWRWithEmailAccount<GetSetupProgressResponse>(
    "/api/user/setup-progress",
  );
}
