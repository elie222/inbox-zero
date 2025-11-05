import type { GetSetupProgressResponse } from "@/app/api/user/setup-progress/route";
import { useSWRWithEmailAccount, processSWRResponse } from "@/utils/swr";

export function useSetupProgress() {
  const swr = useSWRWithEmailAccount<GetSetupProgressResponse>(
    "/api/user/setup-progress",
  );
  return processSWRResponse<GetSetupProgressResponse>(swr);
}
