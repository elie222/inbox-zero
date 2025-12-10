import useSWR from "swr";
import type { OrgTotalsResponse } from "@/app/api/organizations/[organizationId]/stats/totals/route";
import type { OrgStatsParams } from "@/app/api/organizations/[organizationId]/stats/types";

export function useOrgStatsTotals(
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

  return useSWR<OrgTotalsResponse>(
    `/api/organizations/${organizationId}/stats/totals${queryString ? `?${queryString}` : ""}`,
  );
}
