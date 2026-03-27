import useSWR from "swr";
import type { GetDraftReviewSettingsResponse } from "@/app/api/user/draft-review-settings/route";

export function useDraftReviewSettings(emailAccountId?: string | null) {
  return useSWR<GetDraftReviewSettingsResponse>(
    emailAccountId
      ? (["/api/user/draft-review-settings", emailAccountId] as const)
      : null,
  );
}
