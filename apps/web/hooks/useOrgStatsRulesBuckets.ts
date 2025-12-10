import useSWR from "swr";
import type { OrgRulesBucketsResponse } from "@/app/api/organizations/[organizationId]/stats/rules-buckets/route";
import type { OrgStatsParams } from "@/app/api/organizations/[organizationId]/stats/types";

export function useOrgStatsRulesBuckets(
  organizationId: string,
  options?: OrgStatsParams,
) {
  const params = new URLSearchParams();
  if (options?.fromDate) {
    params.set("fromDate", options.fromDate.toString());
  }
  if (options?.toDate) {
    params.set("toDate", options.toDate.toString());
  }
  const queryString = params.toString();

  return useSWR<OrgRulesBucketsResponse>(
    `/api/organizations/${organizationId}/stats/rules-buckets${queryString ? `?${queryString}` : ""}`,
  );
}
