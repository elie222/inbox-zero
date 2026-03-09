import useSWR from "swr";
import type { GetAdminTopSpendersResponse } from "@/app/api/admin/top-spenders/route";

export function useAdminTopSpenders() {
  return useSWR<GetAdminTopSpendersResponse>("/api/admin/top-spenders");
}
