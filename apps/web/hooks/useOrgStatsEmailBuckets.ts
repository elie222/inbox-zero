import useSWR from "swr";
import type { OrgEmailBucketsResponse } from "@/app/api/organizations/[organizationId]/stats/email-buckets/route";
import type { OrgStatsParams } from "@/app/api/organizations/[organizationId]/stats/types";

export function useOrgStatsEmailBuckets(
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

  return useSWR<OrgEmailBucketsResponse>(
    `/api/organizations/${organizationId}/stats/email-buckets${queryString ? `?${queryString}` : ""}`,
  );
}
