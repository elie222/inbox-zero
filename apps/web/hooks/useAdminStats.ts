import useSWR from "swr";
import type { GetAdminOverviewResponse } from "@/app/api/admin/stats/overview/route";
import type { GetAdminSignupsResponse } from "@/app/api/admin/stats/signups/route";
import type { GetAdminThroughputResponse } from "@/app/api/admin/stats/throughput/route";

export type AdminStatsRange = { fromDate?: number; toDate?: number };

export function useAdminOverview(range: AdminStatsRange) {
  return useSWR<GetAdminOverviewResponse>(
    `/api/admin/stats/overview?${toQuery(range)}`,
  );
}

export function useAdminSignups(range: AdminStatsRange) {
  return useSWR<GetAdminSignupsResponse>(
    `/api/admin/stats/signups?${toQuery(range)}`,
  );
}

export function useAdminThroughput() {
  return useSWR<GetAdminThroughputResponse>("/api/admin/stats/throughput");
}

function toQuery({ fromDate, toDate }: AdminStatsRange) {
  const params = new URLSearchParams();
  if (fromDate) params.set("fromDate", String(fromDate));
  if (toDate) params.set("toDate", String(toDate));
  return params.toString();
}
